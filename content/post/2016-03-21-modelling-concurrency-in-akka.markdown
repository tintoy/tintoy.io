---
author: tintoy
comments: true
date: 2016-03-21T09:09:31+11:00
layout: post
title: Modelling concurrency in Akka.NET
categories:
- Akka
- Architecture
- DDCloud
---

As a toolkit, Akka is useful for several reasons. In this series, the primary focus will be on how it can be used to model concurrency.
<!--more-->

This is the second in of a series of posts on Akka.NET and my experience of using it to re-implement one of the core parts of my employer's platform.
You can find the other parts here:
* [Part 1 - Adventures with Akka.NET](../2016-03-10-adventures-with-akka)

#### The actor model
Akka is based on [the actor model](https://en.wikipedia.org/wiki/Actor_model). Without plagiarising Wikipedia too deeply, here's a summary of the salient points:

* An actor is a computational entity that, in response to a message it receives, can perform one or more of the following:
  * Send one or more messages to other actors
  * Create one or more new actors
  * Designate the behavior to be used for the next message it receives

An important concept in actor systems is that actors only process a single incoming message at a time. This means the concurrency for an individual actor instance trivial to deal with; _for each individual actor, there is no concurrency_.

While this makes each actor's behaviour easy to reason about, it does beg the question of how concurrency _is_ achieved. The answer is that _concurrency is achieved by scaling out across multiple actors_.

#### Back to our domain model
Our provisioning engine's job is to run, err... jobs. Here's a simplification of a possible design for the provisioning engine:

![Provisioning Engine actors (stage 1)](../../../../../../images/2016/diagrams/engine-actors-stage-1.jpg)

Note that this system can only process a single job at a time because each actor can only process one message at a time.

In order to run multiple jobs, we could have multiple workers:

![Provisioning Engine actors (stage 2)](../../../../../../images/2016/diagrams/engine-actors-stage-2.jpg)

**AF: Work beckons; this post to be continued later this afternoon...**
