---
author: tintoy
comments: true
layout: post
slug: docker-for-short-lived-processes
title: "Using Docker for short-lived processes"
categories:
  - Docker
  - Orchestration
  - Scheduling
---

These days, most people think of Docker as a kind of hosting environment; it's commonly used as a way of hosting applications and services in (lightweight) isolated, reproducible environments. This workload is usually modelled as long-running processes accessible via HTTP (or similar) APIs. If those processes stop for some reason, they are usually restarted.

**TODO**: Add simple diagram showing application comprised of services in containers.

In order to accomplish this, an orchestrator and / or scheduler is used to monitor and drive Docker (via its API), ensuring that containers are created / started / stopped / destroyed as needed.

**TODO**: Add diagrams indicating role of orchestrator / scheduler in relation to containers they manage (may need to show multiple hosts for scheduler diagram).

But some applications and tools (or combinations thereof) were not designed as long-running services. Instead they are implemented as short-lived processes that are launched, perform their work, and then terminate. They may read and write files on their local file-system, some of which may represent the results of that work.

<!-- more -->

**TODO**: Add glider-gun diagram as an example.

## Existing solutions.

Hashicorp's Nomad can handle short-lived Tasks, and Kubernetes models them as Jobs (but as far as I know Mesos / Marathon and Rancher / Cattle do not specifically target this use-case); given that the most common use-case targeted by modern container orchestrators seems to be long-lived services it's probable that, if you want to use Docker to host short-lived services, you either use Nomad, Kubernetes or roll your own solution.

## Roll-your-own

While there are sometimes legitimate reasons for rolling your own solution, I'd suggest that you first think carefully about whether it's part of your core value-proposition (or whether you could perhaps bend an existing solution to fit without breaking the bank).

Still here? Ok, let's talk about rolling your own solution.

