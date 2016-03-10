---
author: tintoy
comments: true
date: 2016-03-10T18:08:07+11:00
layout: post
title: Adventures with Akka.NET
categories:
- Akka
- Architecture
- DDCloud
---

Akka is an interesting toolkit; I've found that it not only makes it easier to reason about concurrency, but also makes it easy to test that reasoning.

This is the first in of a series of posts on Akka.NET and my experience of using it to re-implement one of the core parts of my employer's platform.
<!--more-->

#### First, a little background
My employer is (among other things) a provider of cloud services; we have an infrastructure-as-a-service (IaaS) offering, and several software-as-a-service (SaaS) offerings built on top of that to provide a self-service experience for IT-as-a-Service (ITaaS) for our customers.

A fair bit of what we do involves the aggregation of one or more vendor (i.e. 3rd-party) products into a single offering with a simplified management experience (usually along the lines of "we manage the kit and vendor products so all you have to do is use this one self-service portal").

What tends to make this an exercise in complexity-management is that:

1. Many vendor products are not designed for programmatic administration / reporting.
2. Many vendor products are not designed for multi-tenancy (something that is often a requirement for economies-of-scale).
3. Even when vendor products _do_ support these things, they often have their own nomenclature / conceptual model to describe them (and this makes it harder to present a unified management experience).

#### A high-level architectural overview
The distributed management system (DMS) is a high-level data store that is designed to be selectively replicated between data centers (subject to constraints such as data sovereignty). It stores high-level "summary" information about entities of interest to our products (e.g. a "User" entity that represents a common definition of a user that all products can agree on). Various products can extend the basic schema for built-in entity types with their own groups of properties.

One of the other major reasons the DMS exists is to provide a consistent view of data; within a given data centre, the DMS is always locally-consistent and ensures that products don't step on each others toes when it comes to performing actions (especially in external systems) that relate to those entities in the DMS. This is why DMS also tracks status for each entity (e.g. `Active`, `Inactive`, `Pending`, etc) and will not allow operations that violate the rules for valid transitions between states.

While the DMS is basically declarative (e.g. "Create an Exchange mailbox user foo@bar.com"), the provisioning system monitors the DMS for new / updated entities and may (depending on configuration) decide to interact with external systems to make those declarations a reality.

For example, if you ask the DMS to create a new Exchange Mailbox resource, the provider API for one of our products will be called by the provisioning engine to perform the required work in Exchange to create the mailbox. The provider might, as part of that work, return some additional properties to be updated on the mailbox entity in the DMS once provisioning is complete.

##### Concurrency (Here Be Dragons)
A naive first-attempt at implementation of the provisioning engine might simply try to run one job at a time. This is simple, and easy to reason about. But it's _slow_. All customers and products are sharing that single queue and _it's going to be hard to explain to one customer that their experience is degraded because of something another customer is doing_.

This is important - a big part of what we do is _making multi-tenancy feel like single-tenancy_. Many customers are happy when they feel like they're your only customer, and you can make them especially happy when they don't have to pay you as if they were.

So, what if we ran jobs in parallel?

Ok, let's think it through:

1. Create a new User
2. Create an Active Directory user for them
3. Create an Exchange Mailbox for them

When we process one job at a time this is simple. But in parallel they might run in the following order:

1. Create a new User
2. Create an Exchange Mailbox for them
3. Create an Active Directory user for them

Obviously these steps could run in any order if they are processed in parallel. But that won't work. No AD account means you can't create an Exchange mailbox for them.

You could try to express inter-job dependencies but that quickly becomes a nightmare to express generically / manage / reason about (yesyesyes, citation needed - perhaps that's worth another post sometime).

So what if we enforced the ordering in the management system rather than the provisioning system?

If you can't run step 2 until step 1 was complete (because User's state was `Pending` or `Provisioning` and the DMS prevents 2 jobs being run concurrently for the same entity), or run step 3 until step 2 was complete (for the same reason), then you've more-or-less solved the ordering / dependency problem.

While it's true that you can't do 2 things at the same time for this particular user, your work can be interleaved with work for other users and so the overall system throughput is higher.

##### Show me the Akka
Thanks for reading this far; I know I promised you Akka, and I intend to deliver that as soon as I can, but it seems I've run out of time for today.

Our actual provisioning engine provides fine-grained control of capacity (for concurrency) and how it is allocated across various customers and their products. This allocation can be re-tuned on-the-fly without having to stop or even pause existing jobs.

Imagine a microcosm of microservices, whose composition and topology can by easily altered at runtime. Now imagine that each of those microservices was easy to test both individually and together. _This is what Akka is good for_.

Stay tuned, I'll try to get the next post written early next week.
