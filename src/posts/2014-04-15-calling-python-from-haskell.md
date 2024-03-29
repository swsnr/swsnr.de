# Calling Python from Haskell

In a past version of this blog I used [Pandoc][] to convert Markdown to HTML.
It's by far the best and most powerful markdown converter, but it has one,
albeit little weakness: Its syntax highlighting is based [highlighting-kate][],
which is less good and supports less languages than the Python library
[Pygments][], the de-facto standard highlighter used by Github and others.

It's easy to implement custom highlighting thanks to the great API of Pandoc,
with just two functions in **Text.Highlighting.Pygments.Pandoc**:

[pandoc]: https://johnmacfarlane.net/pandoc/
[highlighting-kate]: https://hackage.haskell.org/package/highlighting-kate
[pygments]: https://pygments.org/

<!--more-->

```haskell
import Text.Highlighting.Pygments (toHtml)

blockToHtml :: Block -> IO Block
blockToHtml x@(CodeBlock attr _) | attr == nullAttr = return x
blockToHtml x@(CodeBlock (_,[],_) _) = return x
blockToHtml (CodeBlock (_,language:_,_) text) = do
  colored <- toHtml text language
  return (RawBlock (Format "html") colored)
blockToHtml x = return x

codeBlocksToHtml :: Pandoc -> IO Pandoc
codeBlocksToHtml = walkM blockToHtml
```

This code transforms all code blocks to a raw HTML block containing the code
highlighted by Pygments.  The language used in the code block is taken from the
first unnamed attribute of the code block, just like in Github's markdown
dialect.  Code blocks which do not specify a language are not touched.

So far I just went the easy way, and called the
[`pygmentize` script][pygmentize] in `toHtml`, passing the code to be
highlighted on stdin, and reading the result from stdout.  While this is easy to
implement with just a few lines it also slows down the build considerably.

Last weekend I sat down and tried to call Pygments directly via Python's C API
through Haskell's FFI.  This is what came out of this adventure.

[pygmentize]: https://pygments.org/docs/cmdline/

## Native wrappers ##

**Foreign.Python.Native** is an [hsc2hs][] module which imports the
required functions from Python's C API and declares corresponding Haskell
signatures.

The module also declares the necessary types, using a special `hsc2hs` feature
to automatically derive the right Haskell type for a given C type.  For
instance, the following declaration declares an appropriate Haskell alias for
Python's `Py_ssize_t`, so I didn't need to grok the header files for the
typedef:

```haskell
type PySSizeT = #type Py_ssize_t
```

I also use the `CApiFFI` extension to avoid the hassle of finding out whether to
import the UCS2 or the UCS4 API of CPython.  Instead, I just import the macro
API and let GHC figure out the rest:

```haskell
foreign import capi unsafe "Python.h PyUnicode_AsUTF8String"
  pyUnicode_AsUTF8String :: RawPyObject -> IO RawPyObject

foreign import capi unsafe "Python.h PyUnicode_FromStringAndSize"
  pyUnicode_FromStringAndSize :: CString -> PySSizeT -> IO RawPyObject
```

GHC automatically generates a wrapper C functions for these macros, and figures
out whether to link `PyUnicodeUCS2_AsUTF8String` or
`PyUnicodeUCS4_AsUTF8String`.

[hsc2hs]: https://www.haskell.org/ghc/docs/7.6.3/html/users_guide/hsc2hs.html

## Convenient Haskell API ##

**Foreign.Python** is the convenient Haskell API around the
[native Python functions](#native-wrappers).

----

**Update** *(April 16, 2014)*: I changed `toPyObject` to return `Nothing` if
given a null pointer, for increased safety.  Before `toPyObject` would simply
wrap the given pointer, whether `NULL` or not.  The definition of
`toPyObjectChecked` was updated too.

While wrapping a `NULL` pointer in a managed pointer doesn't do any harm in and
by itself, because the dereferencing functions from Python are safe to call with
`NULL`, it was still possible to try and use the pointer, e.g. by trying to call
the underlying Python object, and thus trigger a segfault.

Now it's impossible to obtain a `PyObject` from `NULL`, increasing the safety of
my Python API.

----

I use `ForeignPtr` to wrap the raw `PyObject` pointers into an opaque Haskell
type which automatically calls `Py_XDECREF` on the underlying `PyObject` when it
goes out of scope:

```haskell
newtype PyObject = PyObject (ForeignPtr ())

toPyObject :: RawPyObject -> IO (Maybe PyObject)
toPyObject raw | raw == nullPtr  = return Nothing
toPyObject raw = liftM (Just . PyObject) (newForeignPtr pyDecRef raw)

withPyObject :: PyObject -> (RawPyObject -> IO a) -> IO a
withPyObject (PyObject ptr) = withForeignPtr ptr
```

Only the opaque type is exported from the module, so outside code never has any
chance of messing with the underlying C object and bypassing the garbage
collector.

Many CPython functions return `NULL` to indicate that the operation failed and a
Python exception was raised.  To deal with these situations I use a little
helper that throws a Haskell exception from the current Python exception if
given a `NULL` pointer:

```haskell
toPyObjectChecked :: RawPyObject -> IO PyObject
toPyObjectChecked = toPyObject >=> maybe throwCurrentPythonException return
```

To obtain objects from the Python runtime, I define a bunch of functions to
import modules, get attributes and call objects.  The implementations are
boilerplate code, so I'll just show you the type signatures:

```haskell
importModule :: String -> IO PyObject
getAttr      :: PyObject -> String -> IO PyObject
callObject   :: PyObject -> [PyObject] -> [(PyObject, PyObject)] -> IO PyObject
```

To convert these objects from Haskell, and to pass Haskell objects to Python, I
use a little type class to convert a type to and from Python:

```haskell
class Object a where
  toPy   :: a -> IO PyObject
  fromPy :: PyObject -> IO a
```

As I only need strings to call Pygments, there are only two instances for
`ByteString` and `String`.

To convert from a `ByteString`, I just need to obtain a temporary buffer from
the byte string and pass that to Python:

```haskell
instance Object ByteString where
  toPy s = useAsCStringLen s $ \(buffer, len) ->
    pyString_FromStringAndSize buffer (fromIntegral len) >>= toPyObjectChecked
```

Converting back to a is a little more intricate, because Python needs
addressable fields to take the raw bytes out of the underlying `PyObject`.
`Foreign.Marshal.Alloc.alloca` comes to rescue and conveniently allocates
addressable fields which I can then hand down to Python.  Python puts the memory
address and size of the underlying string buffer into these fields, which I can
then read with `Foreign.Storable.peek` to copy the entire byte sequence into an
independent `ByteString`:

```haskell
  fromPy s =
    alloca $ \s_buffer_ptr ->
    alloca $ \s_len_ptr ->
    withPyObject s $ \raw -> do
      result <- pyString_AsStringAndSize raw s_buffer_ptr s_len_ptr
      unless (result == 0) throwCurrentPythonException
      buffer <- peek s_buffer_ptr
      len <- peek s_len_ptr
      packCStringLen (buffer, fromIntegral len)
```

Converting from a `String` almost looks like converting from a `ByteString`,
except that we need to encode the `String` to UTF-8 to pass it to
`PyUnicode_FromStringAndSize`, which expects a UTF-8 encoded char array.
Converting back is simple as well, because I can build upon the `ByteString`
conversion from above. I just need to turn the Python unicode object into an
encoded char array with `PyUnicode_AsUTF8String` which I can then convert to a
`ByteString` and decode:

```haskell
instance Object String where
  toPy s = useAsCStringLen (UTF8.fromString s) $ \(buffer, len) ->
    pyUnicode_FromStringAndSize buffer (fromIntegral len) >>= toPyObjectChecked
  fromPy o = do
    s <- withPyObject o pyUnicode_AsUTF8String >>= toPyObjectChecked
    liftM UTF8.toString (fromPy s)
```

## Pygments interface ##

**Text.Highlighting.Pygments** is the Pygments interface that builds upon
this [Python API](#convenient-haskell-api).

I start with some type aliases for Pygments types.  They don't add more type
safety, because Python is dynamically typed anyway, but they make the type
signatures a little nicer:

```haskell
type Lexer     = PyObject
type Formatter = PyObject
```

Then I wrap the required functions from Pygments into convenient Haskell
functions. `getLexerByName` gives me the Pygments Lexer for the name of a
programming language:

```haskell
getLexerByName :: String -> IO Lexer
getLexerByName name = do
  initialize False
  lexers <- importModule "pygments.lexers"
  get_lexer_by_name <- getAttr lexers "get_lexer_by_name"
  pyName <- toPy name
  callObject get_lexer_by_name [pyName] []
```

The function

1. initializes the interpreter,
2. imports `pgyments.lexers`,
3. gets a reference to the underlying `get_lexer_by_name` function,
4. converts the given `language` to a Python object,
5. and ultimately calls `get_lexer_by_name` with the appropriate arguments.

This function is as safe as it can be when dealing with a dynamically typed
language:

- It will never try to use invalid objects, because Python operations never fail
  silently.  If any Python call fails, e.g. because Pygments is not installed,
  the Python interface throws a Haskell exception.
- Even in case of an exception, the function does not leak memory.  All
  references to Python objects are managed pointers which automatically free the
  underlying Python object when they go out of scope, whether by a normal
  return, or in case of an exception.

`highlight` highlights a given piece of code with a lexer and formatter:

```haskell
highlight :: String -> Lexer -> Formatter -> IO String
highlight code lexer formatter = do
  initialize False
  pygments <- importModule "pygments"
  py_highlight <- getAttr pygments "highlight"
  codeObj <- toPy code
  callObject py_highlight [codeObj, lexer, formatter] [] >>= fromPy
```

With these convenient wrappers I am now able to implement `toHtml`:

```haskell
toHtml :: String -> String -> IO String
toHtml code language = do
  formatters <- importModule "pygments.formatters"
  html_formatter <- getAttr formatters "HtmlFormatter"
  cssclass_key <- toPy "cssclass"
  cssclass <- toPy "highlight"
  formatter <- callObject html_formatter [] [(cssclass_key, cssclass)]
  lexer <- getLexerByName language
  highlight code lexer formatter
```

This function first creates an instance of the `HtmlFormatter` class, by
importing the `pygments.formatters` module, obtaining a reference to the class
object, and calling the class object with some options to create a new instance.

Then it gets the lexer object, and passes these objects and the code to
`highlight`.  The result is a string containing HTML to highlight the given
`code`.

## Building ##

I use Cabal to build these modules.  The corresponding cabal file is simple:

```
executable lunarsite
  […]
  other-modules:       Foreign.Python
                       Foreign.Python.Native
                       Text.Highlighting.Pygments
                       Text.Highlighting.Pygments.Pandoc
  build-depends:       base >=4.6 && <4.8,
                       bytestring >=0.10 && < 0.11,
                       utf8-string >=0.3 && <0.4,
                       pandoc-types >=1.12 && <1.13,
                       pandoc >=1.12 && <1.13
  build-tools:         hsc2hs

  if os(darwin)
     extra-libraries:   python2.7
     include-dirs:      /usr/include/python2.7
  else
     pkgconfig-depends: python ==2.7
```

I enable `hsc2hs` in `build-tools` to compile
[Foreign.Python.Native](#native-wrappers), and tell Cabal to link
against Python 2.7.

`pkg-config` is missing on OS X, but since the layout of the pre-installed
system Python is fixed anyway, I just hard-code the library name and the include
directory.

On other systems I just rely on Cabal's built-in support for `pkg-config` to
automatically find the library name and the include directories for Python 2.7.

## Lessons learned ##

Calling Python from Haskell was much, much easier than I thought, thanks to
Haskell's good FFI, which takes over all marshaling of primitive types, and
provides great utilities and helpers to marshal complex types.

It would even been even easier, however, if the C API of Python 2.7 was a little
better, and had a little more consistent reference count semantics, and if
Haskell supported varargs functions in its FFI.

While Python functions normally do not steal references and do not return
borrowed references, there are some notable exceptions, which lead the entire
idea to offer a consistent API ad absurdum, since you still need to check any
function carefully for how it handles the reference counts in its arguments and
return values.

And since Haskell doesn't support foreign varargs functions, I often had to
manually assemble complex Python objects such as argument tuples using the
lower-level API, instead of just calling `Py_BuildValue` to build complex
Python objects from C values directly.

Despite these minor nuisances working with Haskell's FFI has been a really
pleasant experience so far, and I'm truly surprised that a language which is
generally renowned for its advancement of computer science also excels at the
dirty low-level task of calling C libraries.

[hakyll]: https://jaspervdj.be/hakyll/
