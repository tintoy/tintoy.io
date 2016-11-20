---
author: tintoy
comments: true
date: 2016-11-13 13:43:00+11:00
layout: post
slug: writing-a-terraform-provider-2
title: Writing a Terraform provider (part 2)
categories:
  - Writing a Terraform provider
  - Go
---

[Part 1](../writing-a-terraform-provider)|Part 2|[Part 3](../writing-a-terraform-provider-3)

## The Terraform extensibility model

Terraform encapsulates functionality for communicating with various back-end systems into 2 basic abstractions: Providers and Provisioners.

### Providers

A provider is the component responsible for implementing one or more resource types by interacting with resources via APIs on behalf of Terraform (and then exposing this information in a format that Terraform can use).

#### External providers

Providers such as our `ddcloud` provider are not part of Terraform; they are not supported by Hashicorp, and must be installed alongside Terraform before they are available for use.

Like many plugin mechanisms in the Go ecosystem, Terraform plugins are implemented as separate executables that are launched by Terraform when their services are required. Terraform then communicates with the plugin process using a form of [RPC](https://github.com/hashicorp/go-plugin). Installing your plugin is as simple as giving its executable the correct name (`terraform-<plugintype>-<pluginname>`) and placing it in the same directory as the main Terraform executable.

Like many things in Go, the basic skeleton for a plugin pretty bare-bones (snicker), but the docs [already show you that](https://www.terraform.io/docs/plugins/provider.html) so I'm going to talk about a driver that actually does stuff :)

##### Plugin entry-point

The main program entry-point ([main.go](https://github.com/DimensionDataResearch/dd-cloud-compute-terraform/blob/development/v1.0/main.go)) is responsible for starting the plugin server to host our provider.
```go
package main

import (
	"ddcloud"
	"github.com/hashicorp/terraform/plugin"
)

func main() {
	plugin.Serve(&plugin.ServeOpts{
		ProviderFunc: ddcloud.ProviderMetadata,
	})
}
```

By the way, don't try to be clever here and support your own (additional) command-line arguments. Terraform is quite picky about how the plugin executable behaves (and what STDOUT / STDERR it produces).

##### Provider metadata

When we start the plugin server, we provide it with metadata for our provider so that Terraform knows what our provider can do.

This includes:

* **Provider settings schema**  
The properties that are required (or valid) on the `ddcloud` `provider` element in configuration.
* **Provider factory**  
The function that creates and configures an instance of the provider for use by Terraform.
* **Resource metadata**  
The properties that are required (or valid) on each matching `resource` element in configuration, as well as the functions that implement that resource type.
* **Data source metadata**  
Which properties are required (or valid) on each matching `data` element in configuration, as well as the functions that implement that data-source.

Here's a simplified version of  [provider.go](https://github.com/DimensionDataResearch/dd-cloud-compute-terraform/blob/development/v1.0/vendor/ddcloud/provider.go):

```go
package ddcloud

import (
	"github.com/hashicorp/terraform/helper/schema"
)

// ProviderMetadata returns the metadata for the ddcloud provider.
func ProviderMetadata() terraform.ResourceProvider {
	return &schema.Provider{
		// Provider settings schema
		Schema: map[string]*schema.Schema{
			"region": &schema.Schema{
				Type:        schema.TypeString,
				Required:    true,
				Description: "The region code that identifies the target end-point for the Dimension Data CloudControl API.",
			},
			"username": &schema.Schema{
				Type:        schema.TypeString,
				Optional:    true,
				Default:     "",
				Description: "The user name used to authenticate to the Dimension Data CloudControl API (if not specified, then the MCP_USER environment variable will be used).",
			},
			"password": &schema.Schema{
				Type:        schema.TypeString,
				Optional:    true,
				Sensitive:   true,
				Default:     "",
				Description: "The password used to authenticate to the Dimension Data CloudControl API (if not specified, then the MCP_PASSWORD environment variable will be used).",
			},
		},

        // Provider factory
		ConfigureFunc: configureProvider,

		// Resource metadata
		ResourcesMap: map[string]*schema.Resource{
			// A network domain.
			"ddcloud_networkdomain": resourceNetworkDomain(),

			// A VLAN.
			"ddcloud_vlan": resourceVLAN(),

			// A server (virtual machine).
			"ddcloud_server": resourceServer(),

			// SNIP! Other resources removed to keep this short.
		},

        // Data-source metadata
		DataSourcesMap: map[string]*schema.Resource{
			// A network domain.
			"ddcloud_networkdomain": dataSourceNetworkDomain(),

			// A virtual network (VLAN).
			"ddcloud_vlan": dataSourceVLAN(),
		},
	}
}
```

##### Provider settings schema

Most providers require some configuration before they are ready to communicate with back-end systems. The nature of this configuration is almost totally provider-specific.

For example, they may need to know the address of the remote API end-point, as well as the credentials required to authenticate to it.

Here's a typical configuration for the `ddcloud` provider:

```
provider "ddcloud" {
    region   = "AU"
    username = "user1"
    password = "f4ncypAssw0rd"

    auto_create_tag_keys = true
}
```

* The `region` property tells the provider which regional API end-point to use
* The `username` and `password` properties indicate the credentials used to authenticate to the CloudControl API.
* `auto_create_tag_keys` tells the provider that it's ok to register missing tag keys when applying tags to resources.

Personally I'd recommend that you permit users to optionally supply credentials from environment variables or a well-known configuration file, rather than forcing them to store them in the configuration. But if for some reason this isn't practical, you can always supply the credentials via `tfvars.json`.

##### Provider factory

Terraform calls your provider factory function to create and configure your provider before use. You can return any object you like here but, since this is the object passed to your resource functions, it should contain all the settings and references to functionality required to communicate with back-end APIs.

Here's a cut-down version of the `ddcloud` provider's factory function:

```go
func configureProvider(providerSettings *schema.ResourceData) (interface{}, error) {
	// Log provider version (for diagnostic purposes).
	log.Print("ddcloud provider version is " + ProviderVersion)

	region := providerSettings.Get("region").(string)
	region = strings.ToLower(region)

	username := providerSettings.Get("username").(string)
	if isEmpty(username) {
		username = os.Getenv("MCP_USER")
		if isEmpty(username) {
			return nil, fmt.Errorf("The 'username' property was not specified for the 'ddcloud' provider, and the 'MCP_USER' environment variable is not present. Please supply either one of these to configure the user name used to authenticate to Dimension Data CloudControl.")
		}
	}

	password := providerSettings.Get("password").(string)
	if isEmpty(password) {
		password = os.Getenv("MCP_PASSWORD")
		if isEmpty(password) {
			return nil, fmt.Errorf("The 'password' property was not specified for the 'ddcloud' provider, and the 'MCP_PASSWORD' environment variable is not present. Please supply either one of these to configure the password used to authenticate to Dimension Data CloudControl.")
		}
	}

	client := compute.NewClient(region, username, password)

	settings := &ProviderSettings{
		AllowServerReboots: providerSettings.Get("allow_server_reboot").(bool),
		AutoCreateTagKeys:  providerSettings.Get("auto_create_tag_keys").(bool),
	}

	provider := &providerState{
		apiClient:   client,
		settings:    settings,
		stateLock:   &sync.Mutex{},
		domainLocks: make(map[string]*sync.Mutex),
		serverLocks: make(map[string]*sync.Mutex),
	}

	return provider, nil
}
```

As you can see, the factory's job is to determine the provider configuration and then wrap it up in something that the rest of the provider functions can use. This is also a useful place to log version information for your provider (for diagnostic purposes).

##### Resource metadata

```go
func resourceNetworkDomain() *schema.Resource {
	return &schema.Resource{
		Schema: map[string]*schema.Schema{
			"name": &schema.Schema{
				Type:        schema.TypeString,
				Required:    true,
				Description: "A name for the network domain",
			},
			"description": &schema.Schema{
				Type:        schema.TypeString,
				Optional:    true,
				Default:     "",
				Description: "A description for the network domain",
			},
			"plan": &schema.Schema{
				Type:        schema.TypeString,
				Optional:    true,
				Default:     "ESSENTIALS",
				Description: "The plan (service level) for the network domain (ESSENTIALS or ADVANCED)",
				StateFunc:  normaliseNetworkDomainPlan,
			},
			"datacenter": &schema.Schema{
				Type:        schema.TypeString,
				ForceNew:    true,
				Required:    true,
				Description: "The Id of the MCP 2.0 datacenter in which the network domain is created",
			},
			"nat_ipv4_address": &schema.Schema{
				Type:        schema.TypeString,
				Computed:    true,
				Description: "The IPv4 address for the network domain's IPv6->IPv4 Source Network Address Translation (SNAT). This is the IPv4 address of the network domain's IPv4 egress",
			},
		},

        // Implementation
        Create: resourceNetworkDomainCreate,
		Read:   resourceNetworkDomainRead,
		Update: resourceNetworkDomainUpdate,
		Delete: resourceNetworkDomainDelete,
	}
}
```

The schema for a Terraform resource describes its attributes and their nature.

For example, the configuration above indicates that `name` is a required string, but `description` and `plan` are optional strings. Additionally, the value of `plan` is always normalised by passing it to the `normaliseNetworkDomainPlan` function (which always converts it to uppercase) before it is stored as state data.

Finally, some properties (e.g. `nat_ipv4_address`) can be _computed_; their value may not be known until the current plan is applied. Note that there are 2 kinds of computed properties. If you also specify `Optional: true` in its definition, then the property is only computed if a value is not supplied in configuration; otherwise, the property can _only_ be computed (rather than being supplied in configuration).

Finally, resource metadata specifies the functions that actually implement the resource (`Create`, `Read`, `Update`, and `Delete`).

Here's a quick glance at the `Create` function for `ddcloud_networkdomain`:

```go
// Create a network domain resource.
func resourceNetworkDomainCreate(data *schema.ResourceData, provider interface{}) error {
	name := data.Get("name").(string)
	description := data.Get("description").(string)
	plan := data.Get("plan").(string)
	datacenterID := data.Get("datacenter").(string)

	log.Printf("Create network domain '%s' in data center '%s' (plan = '%s', description = '%s').",
        name,
        datacenterID,
        plan,
        description,
    )

	apiClient := provider.(*providerState).Client()
	networkDomainID, err := apiClient.DeployNetworkDomain(name, description, plan, datacenterID)
	if err != nil {
		return err
	}

	data.SetId(networkDomainID)

	log.Printf("Network domain '%s' is being provisioned...", networkDomainID)

	resource, err := apiClient.WaitForDeploy(
        compute.ResourceTypeNetworkDomain,
        networkDomainID,
        3*time.Minute, /* timeout */
    )
	if err != nil {
		return err
	}

	// Capture additional properties that are only available after deployment.
	networkDomain := resource.(*compute.NetworkDomain)
	data.Set("nat_ipv4_address", networkDomain.NatIPv4Address)

	return nil
}
```

Word of advice - log early, and log often. Terraform's process model is not particularly debugging-friendly so logging's pretty much the only way to diagnose problems (`TF_LOG=DEBUG` is your friend).

##### Data source metadata

Data sources are just like resources, except that they only have a `Read` function. Nothing to see here, move along.

#### Built-in providers

Many of Terraform's providers are always available because they are [built into](https://github.com/hashicorp/terraform/tree/master/builtin/providers) the main Terraform executable.
Here are a couple of the more well-known ones:

* [Amazon Web Services](https://www.terraform.io/docs/providers/aws/index.html)  
`provider "aws" { ... }`
* [Azure Classic](https://www.terraform.io/docs/providers/azure/index.html)  
`provider "azure" { ... }`
* [Azure Resource Manager](https://www.terraform.io/docs/providers/azurerm/index.html)  
`provider "azurerm" { ... }`
* [Google Cloud](https://www.terraform.io/docs/providers/google/index.html)  
`provider "google" { ... }`

Although these providers are built in, they nevertheless use the same mechanism as external providers to plug into Terraform (there's just no plugin RPC involved since they're in the same process).

### Provisioners

A provisioner is responsible performing one-off tasks after a resource has been provisioned.

Examples include:

* [file](https://www.terraform.io/docs/provisioners/file.html)  
Copies files and directories from the local machine (i.e. the one running Terraform) to the machine being provisioned.
* [local-exec](https://www.terraform.io/docs/provisioners/local-exec.html)  
Executes one or more commands on the local machine.
* [remote-exec](https://www.terraform.io/docs/provisioners/remote-exec.html)  
Executes one or more commands on the machine being provisioned.  
Supports SSH or WinRM.
* [chef](https://www.terraform.io/docs/provisioners/chef.html)  
Installs and configures the [Chef](https://docs.chef.io/release/12-5/chef_client.html) client on the machine being provisioned.

You're probably wondering about the Chef one. Surely you could accomplish the same thing using a combination of the `file` and `local-exec` provisioners, no? Well yes you could but it's nice to have that functionality neatly encapsulated for you. All you need to do is fill in a couple of properties and you're good to go.

I won't spend any more time discussing provisioners at this stage, because we haven't needed to build one ourselves (although someday I may build one to install SSH keys).

## Wrapping up

That's it, really - writing a Terraform plugin isn't particularly difficult as long as you understand the Terraform's life-cycle model, and remember to log as much as you can.

It's worth pointing out that while I've done a fair bit of work with Go, I'm by no means an expert - if you see something that could be done better (or in a more idiomatic way), please feel free to leave a comment. I'm always happy to learn something new :)

---

Tune in next time for part 3 - automated testing for your provider.
