---
author: tintoy
comments: true
date: 2016-11-20 16:18:00+11:00
layout: post
slug: writing-a-terraform-provider-3
title: Writing a Terraform provider (part 3)
categories:
  - Writing a Terraform provider
  - Go
---

[Part 1](../writing-a-terraform-provider)|[Part 2](../writing-a-terraform-provider-2)|Part 3

## Acceptance tests

As with any software that has dependencies on external systems, the question of how to write automated acceptance tests for a Terraform provider can be a little tricky (usually the systems you depend on are sufficiently complex that it's not practical to mock them).

Although you might be able to get away with using a record / playback proxy to simulate remote APIs, these systems tend to be _very_ stateful and when you combine this with Terraform's only-semi-deterministic ordering of commands to external systems the complexity quickly becomes unmanageable. The general approach therefore tends to be "run the tests against the real system".

### Automation

Even though we have to run our tests against the real back-end, it'd still be better to automate them as much as possible; manual tests lack reproducibility and are therefore not as useful for something like Terraform.

Terraform acceptance tests are run and monitored by the Go unit test framework, so they can be run along with any other tests you may have. But since they will probably result in the creation of real resources that you can be billed for, you probably don't want to run them by accident.

Fortunately Terraform's `resource` package provides facilities for encapsulating an acceptance test so it behaves like a unit test (but only runs if `TF_ACC=1`).

#### Implementing acceptance tests

```go
// Acceptance test for ddcloud_networkdomain resource (basic):
//
// Create a network domain and verify that it gets created with the correct configuration.
func TestAccNetworkDomainBasicCreate(t *testing.T) {
	resource.Test(t, resource.TestCase{
		Providers:    testAccProviders,
		CheckDestroy: testCheckDDCloudNetworkDomainDestroy,
		Steps: []resource.TestStep{
			resource.TestStep{
				Config: testAccDDCloudNetworkDomainBasic(
					"acc-test-domain",
					"Network domain for Terraform acceptance test.",
					"AU9",
				),
				Check: resource.ComposeTestCheckFunc(
					testCheckDDCloudNetworkDomainExists("acc_test_domain", true),
					testCheckDDCloudNetworkDomainMatches("acc_test_domain", compute.NetworkDomain{
						Name:         "acc-test-domain",
						Description:  "Network domain for Terraform acceptance test.",
						DatacenterID: "AU9",
					}),
				),
			},
		},
	})
}
```

##### Arrange, Act, Assert = Config, Apply, Check

The idea here is that each test case is composed of one or more reusable test steps. These steps are executed in order until one fails or all have been executed.

A test step is comprised of a configuration (if you were running the `terraform` as part of a manual test, this would be the contents of the .tf files in the current directory) and a check function (think of it as an assertion) that is called once the configuration has been applied. Normally, multiple check functions are combined using a function called `resource.ComposeTestCheckFunc`. This way your assertions are reusable, too.

##### Acceptance test behaviour

The test immediately calls into `resource.Test`, a function provided by Terraform's `resource` package that handles most of the common acceptance-test behaviours.

The function names are long and kinda ugly, but that's at least partially due to limitations of the Go language (specifically, very limited support for scoping members except at the package level). Nevertheless, there's an important pattern here.

* `TestAcc` / `testAcc` - all acceptance tests and acceptance-test configuration functions start with this prefix. The `Test` / `test` prefixes, in particular, mark them as a test-related functions (`TestXXX` will be invoked by `go test`)
* `DDCloud` - this _isn't_ critical for you if you're not building and testing multiple providers  
But I consider it part of being a good neighbour :)
* `NetworkDomain` - the type of resource that the test relates to  
I'll be talking more about why this is important shortly
* `Basic` - a sub-category for the test  
In this case, it indicates that this test is the golden path / common use case

Test names are canonical, and you can therefore use a prefix to narrow down the list of tests that you want to run. This is important because acceptance tests are *slow* - you really don't want run every acceptance test just to get the results of a single test.

So in addition to setting `TF_ACC=1` in your environment, you can also pass a `-run=testPrefix` parameter to `go test`, and only acceptance tests that start with the specified prefix will be run. For example, to run all network domain acceptance tests, pass `-run=TestAccDDCloudNetworkDomain`. In fact, you can make it even shorter by customising your `Makefile`.

```makefile
# Run acceptance tests
testacc:
	TF_ACC=1 \
		go test -v \
		github.com/DimensionDataResearch/dd-cloud-compute-terraform/vendor/ddcloud \
		-timeout 120m \
		-run=TestAcc${TEST}
```

Now you can run `make testacc TEST=NetworkDomain`, which will run all network domain tests.

#### Configurations for acceptance tests

It's a good idea to parameterise the Terraform configurations that you use in your tests.
For example, here's a configuration that creates a single network domain.

```go
func testAccDDCloudNetworkDomainBasic(name string, description string, datacenterID string) string {
	return fmt.Sprintf(`
		provider "ddcloud" {
			region		= "AU"
		}

		resource "ddcloud_networkdomain" "acc_test_domain" {
			name		= "%s"
			description	= "%s"
			datacenter	= "%s"
		}`,
		name, description, datacenterID,
	)
}
```

##### Checks (i.e. assertions)

Consider the `testCheckDDCloudNetworkDomainMatches` function. It generates a check function that examines resource state, verifying that the specified `ddcloud_networkdomain` resource exists, and has the specified properties.

```go
// Check that a ddcloud_networkdomain matches the specified properties.
//
// name is the name of the ddcloud_networkdomain resource.
// expected is a compute.NetworkDomain representing the properties that the ddcloud_networkdomain is expected to have
func testCheckDDCloudNetworkDomainMatches(name string, expected compute.NetworkDomain) resource.TestCheckFunc {
    // Caller doesn't have to specify the ddcloud_server prefix (we'll add it if they don't)
    name = ensureResourceTypePrefix(name, "ddcloud_networkdomain")

    // The actual check function
    //
    // state is the Terraform state data after the configuration has been applied
	return func(state *terraform.State) error {
        // Find the state data for the target resource
		res, ok := state.RootModule().Resources[name]
		if !ok {
			return fmt.Errorf("Not found: %s", name)
		}

        // We'll need the Id to look up the network domain in CloudControl
		networkDomainID := res.Primary.ID

		client := testAccProvider.Meta().(*providerState).Client()
		networkDomain, err := client.GetNetworkDomain(networkDomainID)
		if err != nil {
			return fmt.Errorf("Bad: Get network domain: %s", err)
		}
		if networkDomain == nil {
			return fmt.Errorf("Bad: Network domain not found with Id '%s'.", networkDomainID)
		}

        // Verify that properties match

		if networkDomain.Name != expected.Name {
			return fmt.Errorf("Bad: Network domain '%s' has name '%s' (expected '%s').", networkDomainID, networkDomain.Name, expected.Name)
		}

		if networkDomain.Description != expected.Description {
			return fmt.Errorf("Bad: Network domain '%s' has name '%s' (expected '%s').", networkDomainID, networkDomain.Description, expected.Description)
		}

		return nil // Success
	}
}
```

This is the most common pattern for check functions - look up real entity using product API, then compare it to the information in the resource state data.

There are [more](https://github.com/DimensionDataResearch/dd-cloud-compute-terraform/blob/development/v1.0/vendor/ddcloud/resource_test.go#L62) [complex](https://github.com/DimensionDataResearch/dd-cloud-compute-terraform/blob/8ee878f594a82eafd5275519640bb65df83e64fa/vendor/ddcloud/resource_vip_pool_test.go#L129) [checks](https://github.com/DimensionDataResearch/dd-cloud-compute-terraform/blob/development/v1.0/vendor/ddcloud/resource_test.go#L135) (e.g. has resource been updated in-place, or has resource been destroyed and re-created) but I'll save them for another post.

##### Cleanup

Once the test is complete, you'll want to clean up any and all instances of resources that your test created. But your tests and test functions don't clean up resources. Your provider should be doing that, because the last phase of running an acceptance test is to destroy the configuration (equivalent to `terraform destroy`). If your provider failed to clean up, then destruction checks should catch it (and obviously you'll want to fix this or you'll keep paying for them).

```go
// Acceptance test resource-destruction for ddcloud_networkdomain:
//
// Check all network domains specified in the configuration have been destroyed.
func testCheckDDCloudNetworkDomainDestroy(state *terraform.State) error {
	for _, res := range state.RootModule().Resources {
		if res.Type != "ddcloud_networkdomain" {
			continue
		}

		networkDomainID := res.Primary.ID

		client := testAccProvider.Meta().(*providerState).Client()
		networkDomain, err := client.GetNetworkDomain(networkDomainID)
		if err != nil {
			return nil
		}
		if networkDomain != nil {
			return fmt.Errorf("Network domain '%s' still exists.", networkDomainID)
		}
	}

	return nil
}
```
