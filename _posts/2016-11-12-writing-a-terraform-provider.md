---
author: tintoy
comments: true
date: 2016-11-12 21:18:00+11:00
layout: post
slug: writing-a-terraform-provider
title: Writing a Terraform provider (part 1)
categories:
  - Writing a Terraform provider
  - Go
---

Part 1|[Part 2](../writing-a-terraform-provider-2)

A couple of months ago, I started writing a [provider](https://github.com/DimensionDataResearch/dd-cloud-compute-terraform) for [Terraform](https://terraform.io) (a declarative configuration-management tool for infrastructure).

The goal was to get Terraform talking to [Dimension Data CloudControl](https://docs.mcp-services.net/display/DEV/Welcome+to+the+CloudControl+documentation+portal), the control plane for our cloud compute facilities (the Managed Cloud Platform, or MCP).

As it turns out, you need to put a fair bit of thought into the design of your driver.

## Terraform's conceptual model

In my opinion one of the best design choices made by Hashicorp, when they created Terraform, was to avoid abstraction of cloud provider resource models (despite the similarity of services provided by various cloud service providers, they each have their own idiosyncratic models).

Terraform does not attempt to make the configuration for each of its providers look the same (unlike, say, [Apache Libcloud](https://libcloud.apache.org/)). Instead, its focus is on providing a consistent model for _resource life-cycle_.

So while it _can't_ provide you with a single configuration that you can deploy to either Azure or AWS, you _can_ create 2 configurations that will both exhibit the same behaviour (at a high level, at least).

And the resource model is fairly simple - each resource implements the same 4-5 operations:

* Create (create the resource)
* Read (read the target resource's current state, and use it to update Terraform's state data)
* Update (update the resource based on the current Terraform state data)
* Delete (delete the resource)
* Exists (check if the target resource currently exists)

Terraform compares existing and target resource state, and decides which operations to invoke (and which resources to invoke them for).

## CloudControl's conceptual model

The CloudControl API exposes following resource model for interacting with MCP resources:

| CloudControl              | Terraform                      |
| :------------------------ | :----------------------------- |
| Network domain            | `ddcloud_networkdomain`        |
| VLAN                      | `ddcloud_vlan`                 |
| Firewall rule             | `ddcloud_firewall_rule`        |
| IP address list           | `ddcloud_address_list`         |
| Port list                 | `ddcloud_port_list`            |
| NAT rule                  | `ddcloud_nat`                  |
| Server                    | `ddcloud_server`               |
| Server network adapter    | `ddcloud_server_nic`           |
| Server anti-affinity rule | `ddcloud_server_anti_affinity` |
| VIP node                  | `ddcloud_vip_node`             |
| VIP pool                  | `ddcloud_vip_pool`             |
| VIP pool membership       | `ddcloud_vip_pool_member`      |
| Virtual listener          | `ddcloud_virtual_listener`     |

* **Network domain**  
Top-level container for resources in a data centre.  
Roughly analogous to an AWS VPC or Azure Network.
* **VLAN**  
A virtual network.
* **Firewall rule**  
An access-control rule for inbound or outbound network traffic.
* **IP address list**  
A composable list of IP addresses used to simplify management of firewall rules.
* **Port list**  
A composable list of ports used to simplify management of firewall rules.
* **NAT rule**  
A mapping from a public (external) IP address to a private (internal) IP address in a VLAN.
* **Server**  
A virtual machine.  
Created from an image, a server has one or more virtual disks, and one or more network adapters. Each network adapter is attached to a VLAN.
* **Server anti-affinity rule**  
Ensures that 2 servers will not be hosted on the same physical hardware (important for high-availability scenarios).
* **VIP Node**  
A private IP address that can be a member of one or more virtual IP (VIP) pools.
* **VIP Pool**  
A grouping of VIP nodes.
* **Virtual Listener**  
A load balancer for requests on a VIP.  
Delegates request handling to the nodes in a VIP pool.

### Direct mappings

Many CloudControl resources are directly mapped to Terraform resource types:

* `ddcloud_networkdomain` ([docs](https://github.com/DimensionDataResearch/dd-cloud-compute-terraform/blob/development/v1.0/docs/resource_types/networkdomain.md))
* `ddcloud_vlan` ([docs](https://github.com/DimensionDataResearch/dd-cloud-compute-terraform/blob/development/v1.0/docs/resource_types/vlan.md))
* `ddcloud_nat` ([docs](https://github.com/DimensionDataResearch/dd-cloud-compute-terraform/blob/development/v1.0/docs/resource_types/nat.md))
* `ddcloud_firewall_rule` ([docs](https://github.com/DimensionDataResearch/dd-cloud-compute-terraform/blob/development/v1.0/docs/resource_types/firewall_rule.md))
* `ddcloud_address_list` ([docs](https://github.com/DimensionDataResearch/dd-cloud-compute-terraform/blob/development/v1.0/docs/resource_types/address_list.md))
* `ddcloud_port_list` ([docs](https://github.com/DimensionDataResearch/dd-cloud-compute-terraform/blob/development/v1.0/docs/resource_types/port_list.md))
* `ddcloud_server` ([docs](https://github.com/DimensionDataResearch/dd-cloud-compute-terraform/blob/development/v1.0/docs/resource_types/server.md))
* `ddcloud_server_anti_affinity` ([docs](https://github.com/DimensionDataResearch/dd-cloud-compute-terraform/blob/development/v1.0/docs/resource_types/server_anti_affinity.md))
* `ddcloud_vip_node` ([docs](https://github.com/DimensionDataResearch/dd-cloud-compute-terraform/blob/development/v1.0/docs/resource_types/vip_node.md))
* `ddcloud_vip_pool` ([docs](https://github.com/DimensionDataResearch/dd-cloud-compute-terraform/blob/development/v1.0/docs/resource_types/vip_pool.md))
* `ddcloud_virtual_listener` ([docs](https://github.com/DimensionDataResearch/dd-cloud-compute-terraform/blob/development/v1.0/docs/resource_types/virtual_listener.md))

Note that while a server is primarily mapped to the `ddcloud_server` resource type, some of its constituent components are represented separately (as I'll explain below).

### Concurrency (as ever, here be dragons)

Terraform is promiscuously parallel; it will attempt to parallelise as many operations as possible (subject to inter-resource dependencies). The CloudControl API, however, does not permit multiple simultaneous operations across a variety of resources (from what I understand this is partially due to limitations of the underlying technologies). For example, only 1 network domain or VLAN can be deployed at a time for each organisation. So how do we balance Terraform's desire to multitask with CloudControl's desire to focus on one thing at a time?

We cheat. And not particularly well, if I'm to be honest. We maintain a series of locks inside the provider that ensure only compatible operations can be performed in parallel. But this doesn't work well if 2 people in the same organisation are running Terraform deployments simultaneously. The more correct way would be to [watch](https://github.com/DimensionDataResearch/dd-cloud-compute-terraform/issues/11) for the RESOURCE_BUSY response from CloudControl and periodically retry the operation until it succeeds.

But such is the beauty of Terraform. If your provider is well-written, an error is not the end of the world. Just run `terraform apply` again and it will pick up where it left off!

### Relationship resources

Although it is possible to model a VIP node's membership of a VIP pool via a property on either the `ddcloud_vip_node` or `ddcloud_vip_pool` resource, this turns out to be a bad idea. Because CloudControl wants exclusive access to both the VIP node and VIP pool when establishing a relationship, it's better to model the membership as a separate resource (`ddcloud_vip_pool_member`).

### Wholly-subsidiary resources

Unlike a server's virtual disks (which can each be uniquely identifier by their SCSI unit Id), its virtual network adapters have no immutable properties (i.e. all NIC properties can change at any time). Given Terraform's diff/apply behaviour, this is problematic from a state-management perspective because although each adapter has a unique Id, this Id is assigned by CloudControl and will not be present in the configuration (only in the persisted state data).

So if I have a set of 4 adapters, and a property changes on one of them, we have no way of knowing which one was changed (since none of the properties in the configuration map are sufficient to uniquely identify a specific network adapter).

We therefore decided to model additional (non-primary) network adapters via the `ddcloud_server_nic` resource type. It's slightly awkward, but Hashicorp are [still considering](https://github.com/hashicorp/terraform/issues/2275) ways to improve nesting of subsidiary resources.

### Implicit resources

Some resource types, however, are poor candidates for being directly exposed at all. For example, you have no way of knowing, when writing your configuration, how many public IPs will be allocated when you request a new public IP block. The API exists, but the exact number of IPs in a block is only known at runtime (by querying metadata for the target data centre).

So while we could implement a `ddcloud_public_ip_block` resource type, it wouldn't be particularly useful; your configuration can't rely on the block having a particular number of IPs. And without knowing that, you can't know until you apply your configuration whether that configuration is workable. Kinda defeats the purpose of using Terraform, really.

Our Terraform provider therefore allocates public IP blocks when needed (i.e. a public IP is required, and no free ones are currently available in the target network domain) and frees those blocks when it deletes their parent network domain.

## Data sources

Some resources are expensive to create, or cannot be programmatically created at all. For example an Amazon Machine Image (AMI) has an Id, but you wouldn't use Terraform to create one. Nevertheless, you need to look up the AMI identifier in order to deploy an EC2 instance (VM). An Azure storage account is also often painfully slow to create. And sometimes you simply want Terraform to be aware of a resource without managing it.

Terraform data-sources are like read-only resources. Instead of the Create/Read/Update/Delete operations supported by resources, they only support Read (which looks up the entity using one or more well-known properties and then expose the rest of its properties for use in a Terraform configuration).

For CloudControl, both network domains and VLANs can sometimes be expensive to create (in terms of time, mainly). When I'm prototyping, I just want to be able to create and destroy servers and their associated network configuration and so it's useful to have data sources representing the network domain and VLAN(s).

For now, we support just 2 data sources (but others will be added over time):

* `ddcloud_networkdomain` ([docs](https://github.com/DimensionDataResearch/dd-cloud-compute-terraform/blob/development/v1.0/docs/datasource_types/networkdomain.md))
* `ddcloud_vlan` ([docs](https://github.com/DimensionDataResearch/dd-cloud-compute-terraform/blob/development/v1.0/docs/datasource_types/vlan.md))

---

Tune in next time for part 2 - the Terraform extensibility model.
