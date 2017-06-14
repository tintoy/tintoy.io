---
author: tintoy
layout: post
comments: true
slug: exporting-environment-variables-from-python-to-bash
title: Exporting environment variables from Python to Bash
date: 2017-06-14 11:24:00+10:00
categories:
  - Python
  - Bash
---

Environment variables are used almost everywhere, but they're somewhat painful to deal with when you need to set them from something other than the current shell's scripting language.

The problem is that each process has its own set of environment variables, and while these will be passed to child processes (when they're launched), a child process can never affect its parent's environment.

This is by design (the other way lies madness), but it does make it difficult to export environment variables whose values come (for example) from a Python script.

I recently had to write a Python script to parse values out of [Vault](https://vaultproject.io) and then export them as environment variables for use by [Teraform](https://terraform.io).

There are 2 approaches that can work here:

1. Have the Python script launch whatever process needs those environment variables. This can work, but it's a little ugly to read in a script (it'd have to be at the start of every line, or you'd need one script to launch another).
2. Have the Python script spit out a set of `export XXX="YYY"` statements, and use Bash's `eval` to execute them (at first I got confused, and tried to use `$()`, which won't work; TBH I don't strictly understand why that's the case but I'll write another post when I figure it out).

Here's a simplified version of the script:

```python
#!/usr/bin/python

"""
Read variables from Vault and output them as BASH-style 'export X="Y"' statements.
"""

import argparse
import hvac
import os

def main():
    """
    The main program entry-point.
    """

    parser = argparse.ArgumentParser(__file__, __doc__,
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )
    parser.add_argument("--vault-address",
        default=os.getenv("VAULT_ADDR"),
        help="The address of the Vault server."
    )
    parser.add_argument("--vault-token",
        default=os.getenv("VAULT_TOKEN"),
        help="The token for authentication to the Vault server."
    )
    parser.add_argument("--vault-path",
        required=True,
        help="The path of the target secret in Vault."
    )
    args = parser.parse_args()

    if not args.vault_address:
        parser.exit(status=1, message="Must specify address of Vault server using --vault-address argument or VAULT_ADDR environment variable.")

    if not args.vault_token:
        parser.exit(status=1, message="Must specify security token for Vault server using --vault-token argument or VAULT_TOKEN environment variable.")

    client = hvac.Client(args.vault_address, token=args.vault_token)
    secret = client.read(args.vault_path)
    if secret is None:
        parser.exit(status=2, message="Secret not found at '{}/{}'.".format(args.vault_address, args.vault_path))

    secret_data = secret["data"]
    for name, value in secret_data.items():
        # Escape symbols commonly used by Bash.
        value = value.replace('"', '\\"').replace('$', '\\$').replace('`', '\\`')

        print('export TF_VAR_{}="{}"'.format(
            name,
            value
        ))

if __name__ == '__main__':
    main()
```

The output from a typical run would be something like:

```bash
export TF_VAR_secret1="TellNobody"
export TF_VAR_secret2="TrustNo1"
```

And you can export these values by running:

```bash
eval `./read_variables_from_vault.py`

echo $TF_VAR_secret1
echo $TF_VAR_secret2
```
