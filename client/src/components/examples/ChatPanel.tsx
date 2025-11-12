import ChatPanel from "../ChatPanel";

const mockMessages = [
  {
    id: "1",
    role: "user" as const,
    content: "Can you help me create a React component for a todo list?",
    timestamp: new Date(Date.now() - 300000),
  },
  {
    id: "2",
    role: "agent" as const,
    content: `I'll create a todo list component for you. Here's a simple implementation:

\`\`\`typescript
interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

function TodoList() {
  const [todos, setTodos] = useState<Todo[]>([]);
  // ... rest of the implementation
}
\`\`\`

Would you like me to add more features?`,
    timestamp: new Date(Date.now() - 240000),
  },
  {
    id: "3",
    role: "user" as const,
    content: "Yes, please add the ability to edit and delete todos.",
    timestamp: new Date(Date.now() - 60000),
  },
];

export default function ChatPanelExample() {
  return (
    <div className="h-screen w-96">
      <ChatPanel
        messages={mockMessages}
        onSendMessage={(content) => console.log("Send:", content)}
        isStreaming={true}
      />
    </div>
  );
}
