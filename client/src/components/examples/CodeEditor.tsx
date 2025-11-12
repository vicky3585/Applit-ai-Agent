import CodeEditor from "../CodeEditor";

const mockTabs = [
  {
    id: "1",
    name: "App.tsx",
    language: "typescript",
    content: `import { useState } from 'react';

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="App">
      <h1>Counter: {count}</h1>
      <button onClick={() => setCount(count + 1)}>
        Increment
      </button>
    </div>
  );
}

export default App;`,
    unsaved: false,
  },
  {
    id: "2",
    name: "index.tsx",
    language: "typescript",
    content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`,
    unsaved: true,
  },
];

export default function CodeEditorExample() {
  return (
    <div className="h-screen">
      <CodeEditor
        tabs={mockTabs}
        activeTabId="1"
        onTabChange={(id) => console.log("Tab changed:", id)}
        onTabClose={(id) => console.log("Close tab:", id)}
        onContentChange={(id, content) => console.log("Content changed:", id, content.length)}
      />
    </div>
  );
}
