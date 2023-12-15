---
tags: ["kubernetes", "gitlab", "docker"]
last_modified_at: 2021-08-23T18:45:29+00:00
---

# The mysterious disapperance of Docker images

A node hosts a Gitlab runner and a small k3s cluster which runs a few services as regular kubernetes deployments. A CI job pinned to that runner builds Docker images  for these services services, updates the image of the corresponding deployments, and starts a few system and acceptance tests. The CI job does not push those images to the in-house registry; to avoid polluting the registry with hundreds of images it just builds locally.

Each test then scales each deployment to zero replicas to effectively stop all services, clears the system’s underlying database, and scales the service deployments back to a small number of replicas sufficient for testing.

The whole thing runs fine until one day the replicas randomly fail to start.

<!--more-->

The first symptom is that the tests time out while waiting for replicas to start. The services remain unreachable after system reset.  Inspecting the deployment reveals that the Docker image doesn’t exist:

```console
$ kubectl describe pod foo-68fbd8c7c5-8grqd
Name:         foo-68fbd8c7c5-8grqd
[…]
Events:
  Type     Reason     Age                   From               Message
  ----     ------     ----                  ----               -------
  Normal   Scheduled  13m                   default-scheduler  Successfully assigned default/foo-68fbd8c7c5-8grqd to node.example.com
  Normal   BackOff    11m (x6 over 13m)     kubelet            Back-off pulling image "registry.example.com/foo/foo:1.2.3-64-affa5225"
  Normal   Pulling    11m (x4 over 13m)     kubelet            Pulling image "registry.example.com/foo/foo:1.2.3-64-affa5225"
  Warning  Failed     11m (x4 over 13m)     kubelet            Error: ErrImagePull
  Warning  Failed     11m (x4 over 13m)     kubelet            Failed to pull image "registry.example.com/foo/foo:1.2.3-64-affa5225": rpc error: code = Unknown desc = Error response from daemon: manifest for registry.example.com/foo/foo:1.2.3-64-affa5225 not found: manifest unknown: manifest unknown
  Warning  Failed     3m11s (x43 over 13m)  kubelet            Error: ImagePullBackOff
```

Docker doesn’t find the image in the registry because it was never pushed, but it shouldn’t even try to ask the registry: The image was built locally and should already exist on the node.  So why is it gone? Perhaps a docker build failure?

However a `docker image ls` thrown into the pipeline before the test reveals that the image builds fine; in fact it’s there minutes before the test starts and then randomly disappears while the tests are running.  Clearly something’s deleting images from the Docker daemon.

Some careful search for the right keywords (“docker images disappear” wasn’t good enough) reveals a [Stack Overflow answer](https://stackoverflow.com/questions/58348036/docker-images-disappearing-over-time) pointing to [Kubernetes’ own garbage collection](https://kubernetes.io/docs/concepts/architecture/garbage-collection/#containers-images) which runs *every minute*, and, under disk space pressure, removes unused Docker images. And indeed, on the affected node kubelet wanted to delete even more:

```
[…] node.example.com k3s[…]: E0809 […] Image garbage collection failed multiple times in a row: wanted to free 311382016 bytes, but freed 573253440 bytes space with errors in image deletion
```

Why does kubelet feel pressured to delete images? And why just about 500MiB?  That’s not a lot, by Docker’s standards.

Turns out, the system had a very very small /var/lib/docker:

```console
$ dh -h
Filesystem      Size  Used Avail Use% Mounted on
[…]
/dev/sda6       7.0G  2.3G  4.8G  33% /var
```

Mystery solved: That’s nowhere near enough to satisfy docker’s demand for space, and explains why kubelet feels so much pressure to delete images in almost every build.

As a stop-gap measure all images were pruned; later the day `/var/lib/docker` was given much more space.  The tests haven’t failed since.
