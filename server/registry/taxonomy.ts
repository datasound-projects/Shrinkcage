export const TAXONOMY=[
  {id:'context-compression',name:'Context Compression',description:'Reduce the context supplied to a model.'},
  {id:'output-optimization',name:'Terminal & Tool Output Optimization',description:'Reduce noisy command and tool output.'},
  {id:'semantic-retrieval',name:'Semantic Code Navigation & Retrieval',description:'Retrieve the relevant code instead of whole files.'},
  {id:'mcp-discovery',name:'MCP Optimization & Tool Discovery',description:'Discover tools selectively and reduce schema overhead.'},
  {id:'prompt-caching',name:'Prompt & Context Caching',description:'Reuse cached prompt context where supported.'},
  {id:'persistent-memory',name:'Persistent Memory & Context Reuse',description:'Reuse relevant context across sessions.'},
  {id:'model-routing',name:'Model Routing & API Cost Optimization',description:'Control API routing, budgets and model selection.'},
  {id:'usage-analytics',name:'Token & Usage Analytics',description:'Measure consumption; measurement alone is not savings.'},
  {id:'observability',name:'Observability, Evaluation & Efficiency',description:'Evaluate quality, reliability and resource use.'},
  {id:'other-verified',name:'Other Verified Optimization Mechanisms',description:'Distinct mechanisms with documented evidence.'},
] as const;
export const DISCOVERY_QUERIES={context:'context compression llm in:name,description',output:'token optimization cli in:name,description',mcp:'mcp token context optimization in:description',memory:'coding agent persistent memory in:description',analytics:'token cost usage cli in:description',topics:'topic:llm-optimization'} as const;
