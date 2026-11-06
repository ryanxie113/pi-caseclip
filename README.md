# CaseClip for Pi

Save an agent mistake and your correction as a case card. CaseClip captures the latest user request on the active Pi branch, the final response, related tool calls and results, and your feedback. Cards stay on disk and can be exported as Markdown or JSON.

[简体中文](README.zh-CN.md) · [Example case card](examples/case.md)

## Install

Requires interactive Pi. Tested with Pi 1.5.0 and Node.js 22.22.2.

**From GitHub:** run `pi install git:github.com/ryanxie113/pi-caseclip@v0.1.0`, then restart Pi or run `/reload`.

**From the release archive:** extract the archive. Install the extracted `package` directory using `pi install /absolute/path/to/package`, then restart Pi or run `/reload`.

**From source:** run `npm ci` and `npm run build` in the project directory. Install it with `pi install /absolute/path/to/pi-caseclip` or test it for one invocation with `pi -e ./dist/index.js`.

## Use

After a response goes wrong, run:

```text
/case save Used the retired endpoint. Expect a successful lookup against API v2.
```

Pi opens a review editor. Review the JSON and remove any optional fields you want to exclude. Use **Enter** to accept, **Shift+Enter** to add a line, or **Esc** to cancel.

| Command | Action |
| --- | --- |
| `/case list` | Browse this project’s cases and choose an action |
| `/case show [id]` | Read a saved case |
| `/case edit [id]` | Revise feedback or remove captured fields |
| `/case export [id] [md\|json]` | Review and export a separate local copy. Markdown is the default |
| `/case delete [id]` | Delete a saved case after confirmation |
| `/case help` | See command syntax |

CaseClip scopes cards by the current working directory. It saves them under `~/.pi/agent/caseclip` by default, honors `PI_CODING_AGENT_DIR`, and accepts a storage override via `CASECLIP_DIR`. Exported copies are separate files. CaseClip runs without network access or model calls.

Capture is limited to the latest request, as stored by Pi. It omits thinking, images and tool metadata, and flags missing results and truncated fields. Source identifiers help locate the original entries. User feedback needs review before it can serve as an evaluation target. Check every field before sharing because built-in secret filtering is best effort.

## Develop

```sh
npm ci
npm test
npm run verify:host
npm run demo
npm pack
```

The host check uses the real Pi extension loader and session manager with a synthetic conversation and scripted dialogs. The demo renders a sample failure card without connecting to a model. See the [Pi extension documentation](https://pi.dev/docs/latest/extensions) and [package documentation](https://pi.dev/docs/latest/packages).

MIT. See [LICENSE](LICENSE).
