# User-level agent instructions

## Pi packages

- After installing, removing or updating a Pi package (`pi-bolt install`, `pi-bolt uninstall`, `pi-bolt update --extensions`), run `pi-bolt compile`. A change leaves the previous extension set baked into the binary, so a removed package keeps being referenced — `pi-bolt doctor` reports it as "no longer installed" — until the next compile. It takes ~15-40 s, and the build before is kept: `pi-bolt update --rollback` restores it.
