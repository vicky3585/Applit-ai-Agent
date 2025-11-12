import FileExplorer from "../FileExplorer";

const mockFiles = [
  {
    id: "1",
    name: "src",
    type: "folder" as const,
    children: [
      { id: "2", name: "index.tsx", type: "file" as const, language: "typescript" },
      { id: "3", name: "App.tsx", type: "file" as const, language: "typescript" },
      {
        id: "4",
        name: "components",
        type: "folder" as const,
        children: [
          { id: "5", name: "Button.tsx", type: "file" as const },
          { id: "6", name: "Card.tsx", type: "file" as const },
        ],
      },
    ],
  },
  { id: "7", name: "package.json", type: "file" as const },
  { id: "8", name: "tsconfig.json", type: "file" as const },
];

export default function FileExplorerExample() {
  return (
    <div className="h-screen">
      <FileExplorer
        files={mockFiles}
        onFileSelect={(file) => console.log("Selected:", file.name)}
        onNewFile={() => console.log("New file")}
        onNewFolder={() => console.log("New folder")}
      />
    </div>
  );
}
