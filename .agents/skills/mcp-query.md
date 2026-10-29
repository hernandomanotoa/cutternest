# MCP Query Skill

How to query `codebase-memory-mcp` as the source of truth for architecture questions.

## Project name

`cutternest-kit`

## Common commands

```bash
# Health / status
docker exec codebase-memory-mcp codebase-memory-mcp cli list_projects | grep cutternest-kit
docker exec codebase-memory-mcp codebase-memory-mcp cli index_status --project cutternest-kit

# Search / trace / snippet / dead code / architecture
docker exec codebase-memory-mcp codebase-memory-mcp cli search_graph --project cutternest-kit --name_pattern PATTERN
docker exec codebase-memory-mcp codebase-memory-mcp cli trace_path --project cutternest-kit --function-name QUALIFIED_NAME --direction inbound|outbound|both
docker exec codebase-memory-mcp codebase-memory-mcp cli get_code_snippet --project cutternest-kit --qualified-name QUALIFIED_NAME
docker exec codebase-memory-mcp codebase-memory-mcp cli detect_dead_code --project cutternest-kit
docker exec codebase-memory-mcp codebase-memory-mcp cli get_architecture --project cutternest-kit

# Re-index
docker exec -i codebase-memory-mcp codebase-memory-mcp cli index_repository \
  --repo-path /workspace/cutternest-kit \
  --mode fast \
  --name cutternest-kit
```

## Golden rule

MCP is the source of truth. Manual stubs are the audit trail. If MCP contradicts a stub, update the stub.
