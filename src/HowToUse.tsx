export default function HowToUse(){
  return <div className="help-guide">
    <div className="help-start-grid">
      <section className="panel help-panel" aria-labelledby="help-first-session">
        <div className="eyebrow">START HERE</div><h2 id="help-first-session">Start your first session</h2>
        <p>One project can have many sessions. Each session has its own tools.</p>
        <ol className="help-steps">
          <li><strong>Add your project.</strong> Open <a href="#managed">Projects</a>. Click Add project. Choose its folder in the native dialog. You only need to add it once.</li>
          <li><strong>Create a session.</strong> Select the project, then New session. Choose Codex or a supported Claude Code installation. Keep billing on Detect automatically if unsure. Your login stays the same.</li>
          <li><strong>Choose tools.</strong> Compatible tools are recommended. Switch each tool on or off for this session. Advanced tool settings holds extra options.</li>
          <li><strong>Choose your terminal.</strong> Pick an installed terminal if several are listed. Remember my choice saves a default; turn it off for a one-session override. Use Rescan terminals after installing an app.</li>
          <li><strong>Review and open.</strong> Click Review session. Read the changes and notices. Fix any blocked items. Approve the configuration, then Open in Herdr.</li>
          <li><strong>Work and come back.</strong> Type your task in Herdr. To detach, press Ctrl+B, then Q. In Projects, select the session and click Reopen in Herdr to return to that same running session.</li>
        </ol>
        <a className="button primary" href="#setup">Create a session</a>
      </section>
      <section className="panel help-panel help-tools" aria-labelledby="help-tools-heading">
        <div className="eyebrow">YOUR TOOLS</div><h2 id="help-tools-heading">What each tool does</h2>
        <dl>
          <div><dt>RTK</dt><dd>Shortens command output before the agent reads it. Its token reductions are estimates.</dd></div>
          <div><dt>Serena</dt><dd>Helps the agent find relevant code. Tool calls show activity, not a money-saved total.</dd></div>
          <div><dt>Headroom</dt><dd>Compresses context through your local proxy. Works with supported Codex and Claude sessions using subscription or API billing.</dd></div>
        </dl>
        <p>A selected tool is a request. The session must actually load and use it before activity is verified.</p>
        <a href="#registry">Explore the Optimizer Library →</a>
      </section>
    </div>

    <section className="panel help-panel help-topics" aria-labelledby="help-topics-heading">
      <h2 id="help-topics-heading">Find the answer you need</h2><p>Open a topic below. Each link takes you to the right screen.</p>

      <details><summary>Where is everything?</summary><div className="help-topic-body">
        <dl className="help-area-list">
          <div><dt><a href="#overview">Overview</a></dt><dd>Recent sessions and separate tool contributions.</dd></div>
          <div><dt><a href="#managed">Projects</a></dt><dd>Add a folder, then launch and reopen sessions inside that project. Use <a href="#profiles">Profiles</a> for saved setups. Use <a href="#sessions">Saved history</a> to search existing records by agent, provider, project or model.</dd></div>
          <div><dt><a href="#registry">Optimizers</a></dt><dd>Search the registry. Check <a href="#optimizers">Installed tools</a> and <a href="#validation">Validation</a>. Open the <a href="#headroom">Headroom</a>, <a href="#rtk">RTK</a> or <a href="#serena">Serena</a> tab for details and available logs.</dd></div>
          <div><dt><a href="#cost-usage">Cost &amp; usage</a></dt><dd>Tokens and cost figures. <a href="#analytics">Shared analytics</a> shows tool history with time filters. <a href="#benchmarks">Experiments</a> compares completed runs.</dd></div>
          <div><dt><a href="#settings">Settings</a></dt><dd>Billing, prices, budgets and privacy. <a href="#connectors">Connectors</a> controls history discovery. <a href="#health">System health</a> shows ports, errors and native dashboard links.</dd></div>
        </dl>
      </div></details>

      <details><summary>Save a setup with Profiles</summary><div className="help-topic-body">
        <ol><li>Open <a href="#profiles">Projects → Profiles</a>. Choose a preset or New profile.</li><li>Choose tools and settings. Save the profile before previewing.</li><li>Select the launch agent, billing and project. Preview the plan. Review it, approve it, then Open in Herdr.</li></ol>
        <p>Profiles are reusable setups. Baseline has no Shrinkcage-managed tools. Lean, Balanced and Maximum Savings offer different starting points. Custom lets you choose. The profile options also support import, export and Delete custom profile.</p>
      </div></details>

      <details><summary>Change the tools for one session</summary><div className="help-topic-body">
        <ol><li>Open <a href="#managed">Sessions</a>. Select the session. Change its tool checkboxes or settings.</li><li>Click Save next-launch stack, then Preview restart plan.</li><li>Review and approve the plan. Click Open in Herdr to open a separate CLI.</li></ol>
        <p>The original session keeps its configuration. Stop it in its own terminal when ready. Discard pending cancels the saved change.</p>
        <p>Tools configured outside Shrinkcage may still run. Read the preview warnings before treating a run as a clean baseline.</p>
      </div></details>

      <details><summary>Add, check, update or remove a tool</summary><div className="help-topic-body">
        <ol><li>Search <a href="#registry">Optimizers</a>. Open a tool’s details. Check its requirements and supported agents.</li><li>Use Add to stack for a supported tool. Choose a profile or session, review the preview, then apply.</li><li>Use <a href="#validation">Validation</a> for health checks. Recheck tools after an installation or upgrade.</li></ol>
        <p>Open <a href="#optimizers">Installed tools → Add optimizer</a> to inspect a GitHub link, local program, manifest or existing MCP setup. MCP is a connection between an agent and a tool. Adding a candidate does not install or activate it. Unknown tools stay Integration required. Guided only means setup is still manual.</p>
        <p>Follow the provided instructions for installation, updates and removal. Available actions vary by tool. Shrinkcage removes only resources it owns; external installations stay yours.</p>
      </div></details>

      <details><summary>Read session status, activity and history</summary><div className="help-topic-body">
        <ul><li><strong>Installed:</strong> the program was found.</li><li><strong>Desired:</strong> the tools you selected.</li><li><strong>Applied:</strong> configuration added for that launch.</li><li><strong>Verified tool use:</strong> activity was actually observed.</li><li><strong>N/A:</strong> data is unavailable. It does not mean zero.</li></ul>
        <p>Select a session to open Observed tool activity and Usage, costs &amp; data quality. Search and filters narrow the list. Click sortable table headings to change the order.</p>
        <p>Saved history is read-only. It does not take control of an existing CLI. Gemini history is read-only too; managed launches support Codex and compatible Claude Code. A reachable dashboard or listening port is not proof that your session used a tool. Shared log times may show when a counter change was noticed.</p>
      </div></details>

      <details><summary>Understand costs, savings and budgets</summary><div className="help-topic-body">
        <ol><li>Open <a href="#cost-usage">Cost &amp; usage</a>. Choose the period you want to inspect.</li><li>For dollar estimates, open <a href="#settings">Settings → Billing, pricing &amp; budget alerts</a>. Add the exact model ID and reviewed prices in USD per million tokens. Include cache prices when known. Save.</li><li>Set a monthly API budget if useful. Alerts are notices; they do not stop the CLI or enforce a provider spending limit.</li></ol>
        <p>Tokens are small pieces of text counted by AI. Cache means information the provider can reuse. Reported costs come from the source. Estimates use your prices. Subscription API-equivalent value is an estimate, not a lower subscription bill. Hybrid means mixed billing. Missing usage or prices stays N/A.</p>
        <p>Headroom and RTK savings can overlap. Never add them together. Shared tool totals are not assigned to a session without matching evidence.</p>
      </div></details>

      <details><summary>Compare setups with Experiments</summary><div className="help-topic-body">
        <ol><li>Run a baseline with no managed tools. Then run an optimized session on the same task.</li><li>Keep the model, project state and caching conditions as similar as possible. Record success and quality checks.</li><li>After both runs finish, open <a href="#benchmarks">Experiments</a>. Select the two sessions. Confirm the comparison conditions, add results, then record the comparison.</li></ol>
        <p>Compare usage, costs, time and quality where data exists. Unrelated tasks cannot prove savings. Recommendations explain their choices; they are not guaranteed savings.</p>
      </div></details>

      <details><summary>Settings, privacy and everyday controls</summary><div className="help-topic-body">
        <ul><li>Use <a href="#connectors">Connectors</a> to choose which CLI history folders to read. Approve new locations. These switches control discovery, not agent startup or login.</li><li>Use the sun/moon button for silver or graphite appearance.</li><li>Data refreshes every 10 seconds. Refresh updates it now.</li><li><a href="#settings">Settings</a> explains history limits and cleanup. Shrinkcage keeps metadata and counts, not prompts, code or tool arguments. Your CLI may keep its own logs.</li></ul>
      </div></details>

      <details><summary>Stop a session or reopen the app</summary><div className="help-topic-body">
        <p>Use the CLI’s normal exit action or Ctrl+C in that coding terminal. Closing the dashboard does not stop an independently managed CLI. Herdr can keep an agent running after its outer window closes; stop the agent in its pane.</p>
        <p>Reopen in Herdr reconnects to a running session without starting another agent. New sessions opened from the app have this button. Older records may only offer history. A computer restart or stopped Herdr server ends live processes. Automatic agent restoration is disabled. Extra panes are plain shells; start each optimized run from Shrinkcage.</p>
        <p>To open Shrinkcage later, run <code>node scripts/start.mjs</code> from its folder. macOS/Linux can use <code>./start.sh</code>. Windows can use <code>start.cmd</code>. Keep that dashboard terminal open. Ctrl+C there stops only the dashboard.</p>
      </div></details>

      <details><summary>Fix a problem</summary><div className="help-topic-body">
        <dl className="help-fixes">
          <div><dt>Folder picker unavailable?</dt><dd>Use Enter a folder path instead. Choose an existing project folder that Shrinkcage can access.</dd></div>
          <div><dt>Agent missing or unsupported?</dt><dd>Install or update its native CLI. Sign in there. Refresh Shrinkcage.</dd></div>
          <div><dt>Tool offline or validation failed?</dt><dd>Open <a href="#optimizers">Installed tools</a>, <a href="#validation">Validation</a> or <a href="#health">System health</a>. Follow the diagnostic, then recheck. Other tools can still work.</dd></div>
          <div><dt>Plan changed or approval expired?</dt><dd>Review the configuration again. Approve the new plan, then Open in Herdr.</dd></div>
          <div><dt>Terminal did not open?</dt><dd>Check existing windows before retrying. Use Recheck Herdr in the launch review. Herdr needs a supported installation; Windows Herdr launch is unavailable.</dd></div>
          <div><dt>No activity or cost yet?</dt><dd>The agent must use the tool first. Costs also need usage and matching prices. Missing data stays N/A.</dd></div>
        </dl>
      </div></details>
    </section>
  </div>;
}
