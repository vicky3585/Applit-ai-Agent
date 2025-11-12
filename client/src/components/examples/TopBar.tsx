import TopBar from "../TopBar";

export default function TopBarExample() {
  return (
    <TopBar
      workspaceName="ai-agent-demo"
      agentStatus="coding"
      onRunAgent={() => console.log("Run agent")}
      onPauseAgent={() => console.log("Pause agent")}
      onResetAgent={() => console.log("Reset agent")}
      onSettings={() => console.log("Open settings")}
    />
  );
}
