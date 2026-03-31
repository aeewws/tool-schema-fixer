# tool-schema-fixer

`tool-schema-fixer` is a small Node.js CLI for taking generic JSON Schema or tool parameter schema files and normalizing them into shapes that are friendlier to OpenAI, Anthropic, and Gemini tool-calling flows.

The first release is intentionally conservative. It focuses on a clear set of rules that are practical in real tool schemas, emits a machine-readable or text report, and avoids pretending to fully transpile every JSON Schema feature into every provider's subset.

## What it does

- Reads a JSON file containing either a plain schema or a common tool wrapper.
- Supports `lint` for compatibility analysis.
- Supports `fix --target openai|anthropic|gemini` for normalization.
- Writes the fixed schema to stdout or a file.
- Emits a report describing applied fixes and anything that still needs manual review.

Supported wrapper shapes:

- Plain schema: the file itself is the schema.
- OpenAI-style tool wrapper: `{"type":"function","function":{"parameters":{...}}}` or `{"function":{"parameters":{...}}}`
- Generic tool wrapper: `{"name":"...","parameters":{...}}`
- Anthropic-style tool wrapper: `{"name":"...","input_schema":{...}}`

## First-release normalization rules

Current rules are deliberately explicit:

- Strip provider-unfriendly metadata keywords such as `$schema`, `$id`, `example`, `examples`, `deprecated`, `readOnly`, and `writeOnly`.
- Normalize `nullable` and simple null unions:
  - `openai`: collapse to a single concrete type.
  - `anthropic`: convert to JSON Schema `type: ["T", "null"]`.
  - `gemini`: convert to OpenAPI-style `nullable: true`.
- Normalize simple `type: [...]` unions:
  - null unions are rewritten using the target's preferred nullability form.
  - other unions are kept for Anthropic, or rewritten to `anyOf` for Gemini and most OpenAI nested schemas.
- Close object schemas with `additionalProperties: false` when they already declare explicit `properties`.
- For `openai`, fill `required` with every declared property to better match OpenAI's documented structured tool/schema expectations.
- Conservatively report unresolved keywords like `allOf`, `anyOf`, `oneOf`, `not`, `if`, `then`, `else`, `patternProperties`, and related advanced composition keywords instead of rewriting them silently.

Because provider subsets differ, some fixes intentionally trade schema fidelity for broader compatibility. Those cases are surfaced as warnings in the report.

## Install

```bash
npm install
npm run build
```

The package targets Node.js 20+.

You can then run the CLI with:

```bash
node dist/index.js --help
```

Or link it locally:

```bash
npm link
tool-schema-fixer --help
```

## Usage

Lint a schema:

```bash
tool-schema-fixer lint ./schema.json --target openai
```

Fix a schema and print the normalized JSON to stdout:

```bash
tool-schema-fixer fix ./schema.json --target gemini
```

Fix a schema and write the result to a file:

```bash
tool-schema-fixer fix ./schema.json --target anthropic --out ./schema.anthropic.json
```

Emit JSON report output:

```bash
tool-schema-fixer lint ./schema.json --target openai --report json
```

## Example

Input:

```json
{
  "type": "object",
  "properties": {
    "city": {
      "type": ["string", "null"],
      "example": "Denver"
    }
  }
}
```

OpenAI fix result:

```json
{
  "type": "object",
  "properties": {
    "city": {
      "type": "string"
    }
  },
  "additionalProperties": false,
  "required": ["city"]
}
```

Sample text report:

```text
mode: fix
target: openai
wrapper: plain-schema
schema-path: /
findings: 3
errors: 0
warnings: 2
applied: 3
details:
- [warning] type-array-nullable /properties/city/type: Collapsed a nullable type array down to one concrete type for OpenAI. (applied)
- [info] keyword-stripped /properties/city/example: Removed example because it is often unnecessary or problematic across provider-specific schema subsets. (applied)
- [warning] close-object /: Closed an object schema with additionalProperties=false to make the parameter surface more deterministic. (applied)
```

## Why these rules

This repo is informed by official provider documentation, but the implementation is intentionally narrower than any full schema transpiler:

- OpenAI documents a constrained subset for structured schemas and notes that root schemas should be objects and that all fields/function parameters should be required.
- Anthropic tool definitions accept an `input_schema` JSON Schema object.
- Gemini function declarations use a subset of OpenAPI schema objects and explicitly document `nullable` in that schema representation.

The CLI uses those documented constraints as guardrails while keeping first-release rewriting conservative and reviewable.

## Development

```bash
npm test
npm run typecheck
npm run build
```

## License

MIT
