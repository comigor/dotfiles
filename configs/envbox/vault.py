#!/usr/bin/env python3
import os
import shutil
import subprocess
import sys
import tomllib
from pathlib import Path
from urllib.parse import unquote_to_bytes


def unlock_with_pinentry():
    result = subprocess.run(
        ["pinentry-rbw-macos", "--timeout", "60"],
        input=(
            b"SETTITLE Bitwarden CLI\n"
            b"SETDESC Unlock Bitwarden\n"
            b"SETPROMPT Master Password\nGETPIN\nBYE\n"
        ),
        capture_output=True,
        check=True,
        timeout=70,
    )
    lines = result.stdout.splitlines()
    data = [line[2:] for line in lines if line.startswith(b"D ")]
    if any(line.startswith(b"ERR ") for line in lines) or len(data) != 1:
        raise RuntimeError("Bitwarden authentication cancelled or failed")
    password = unquote_to_bytes(data[0])
    if not password or b"\n" in password or b"\r" in password:
        raise RuntimeError("Bitwarden password must be a nonempty single line")
    result = subprocess.run(
        ["bw", "unlock", "--passwordfile", "/dev/stdin", "--raw", "--nointeraction"],
        input=password + b"\n",
        stdout=subprocess.PIPE,
        check=True,
        timeout=60,
    )
    return result.stdout.decode().strip()


def unlock_with_bw_prompt():
    result = subprocess.run(
        ["bw", "unlock", "--raw"],
        stdout=subprocess.PIPE,
        check=True,
        timeout=120,
    )
    return result.stdout.decode().strip()


def unlock():
    if shutil.which("pinentry-rbw-macos"):
        session = unlock_with_pinentry()
    else:
        session = unlock_with_bw_prompt()
    if not session:
        raise RuntimeError("bw returned no session; run bw sync before trying again")
    return session


def main():
    args = sys.argv[1:]
    if args == ["unlock"]:
        print(unlock())
        return
    if len(args) < 2 or args[0] not in {"export", "exec"}:
        raise RuntimeError(
            "usage: vault.py unlock | export PROFILE | exec PROFILE COMMAND..."
        )
    action, profile, *command = args
    config_path = Path(__file__).with_name("fnox.toml")
    config = tomllib.loads(config_path.read_text())
    if profile not in config["profiles"]:
        raise RuntimeError(f"Unknown vault profile: {profile}")
    if (action == "export" and command) or (action == "exec" and not command):
        raise RuntimeError("export takes only a profile; exec requires a command")
    if action == "exec":
        for name, definition in config["profiles"].items():
            if name != "base":
                for key in definition.get("secrets", {}):
                    os.environ.pop(key, None)
        if profile == "staging":
            os.environ.pop("BW_SESSION", None)
            os.environ.pop("FNOX_BW_SESSION", None)
            os.execvp(command[0], command)
    if not os.environ.get("BW_SESSION"):
        if action == "export":
            raise RuntimeError(
                "BW_SESSION is not set; run `bwunlock` before "
                "`DOTFILES_APPLY_SECRETS=1 chezmoi apply`"
            )
        os.environ["BW_SESSION"] = unlock()
    os.environ.pop("FNOX_BW_SESSION", None)
    args = [
        "fnox",
        "--config",
        str(config_path),
        "--profile",
        profile,
        "--no-defaults",
        "--non-interactive",
        "--no-daemon",
        "--if-missing",
        "error",
    ]
    if action == "export":
        args += ["export", "--format", "shell"]
        subprocess.run(args, check=True, timeout=30)
        return
    args += [
        "exec",
        "--",
        "env",
        "-u",
        "BW_SESSION",
        "-u",
        "FNOX_BW_SESSION",
        *command,
    ]
    os.execvp("fnox", args)


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, subprocess.SubprocessError) as error:
        print(f"vault: {error}", file=sys.stderr)
        sys.exit(1)
