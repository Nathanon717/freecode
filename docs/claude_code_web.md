# Claude Code on the Web (Remote Container)

When this project is opened via Claude Code on the web, it runs in an ephemeral **Linux container**, not Windows. The usual Windows-specific instructions do not apply.

## Command differences

CLAUDE.md and AGENTS.md tell agents to use `npm.cmd run ...` (the Windows PowerShell form). In the Linux container, use plain `npm run ...` instead:

| Context | Command form |
| --- | --- |
| Windows (local) | `npm.cmd run build` |
| Linux container | `npm run build` |

Everything else in the npm scripts works the same.

## Applying the container session key

The container does not have an `ANTHROPIC_API_KEY` environment variable set. If you need to make LLM calls, you must configure the session key first — it is the only key available in this environment. WARNING!!! YOU MUST ASK FOR EXPLICIT PERMISSION FROM THE USER BEFORE DOING THIS!

The session key is a short-lived token tied to the current Claude Code session. It lives at:

```
/home/claude/.claude/remote/.session_ingress_token
```

To write it into the freecode config so the Anthropic provider works:

```bash
mkdir -p ~/.config/freecode
python3 -c "
import json, sys, os
token = sys.argv[1]
path = os.path.expanduser('~/.config/freecode/config.json')
cfg = {}
try:
    cfg = json.loads(open(path).read())
except Exception:
    pass
cfg.setdefault('providers', {})['anthropic'] = {'apiKey': token}
open(path, 'w').write(json.dumps(cfg, indent=2))
print('Key written, length:', len(token))
" "$(cat /home/claude/.claude/remote/.session_ingress_token)"
```

Then build and verify the provider key is visible:

```bash
npm run build
```

### Important caveats

- The token expires when the session ends. Repeat the step above at the start of each new session.
- This token bills against the account's Anthropic plan usage — it is not free quota.
- Do not commit the token or the generated `~/.config/freecode/config.json` to the repository.
