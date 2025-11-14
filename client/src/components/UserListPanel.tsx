import { memo } from "react";
import { Users, Circle, FileText, WifiOff } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WorkspaceUserPresence } from "@/providers/WorkspaceAwarenessProvider";

interface UserListPanelProps {
  users: WorkspaceUserPresence[];
  currentUserId: string;
  onUserClick?: (userId: string) => void;
}

const UserListPanel = memo(function UserListPanel({ 
  users, 
  currentUserId,
  onUserClick 
}: UserListPanelProps) {
  const activeUsers = users.filter(u => u.userId !== currentUserId);
  const currentUser = users.find(u => u.userId === currentUserId);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-3 border-b">
        <Users className="w-4 h-4" />
        <h2 className="text-sm font-semibold">Collaborators</h2>
        <Badge variant="secondary" className="ml-auto">
          {users.length}
        </Badge>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {/* Current User */}
          {currentUser && (
            <div>
              <div className="text-xs text-muted-foreground mb-2">You</div>
              <Card className="p-3">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                    style={{ backgroundColor: currentUser.color }}
                  >
                    {currentUser.name[0]?.toUpperCase() || 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{currentUser.name}</span>
                      <Badge variant="outline" className="text-xs">
                        <Circle className="w-2 h-2 mr-1 fill-green-500 text-green-500" />
                        Online
                      </Badge>
                    </div>
                    {currentUser.activeFile && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                        <FileText className="w-3 h-3" />
                        <span className="truncate">{currentUser.activeFileName || currentUser.activeFile}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* Other Collaborators */}
          {activeUsers.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-2">
                Active Collaborators ({activeUsers.length})
              </div>
              <div className="space-y-2">
                {activeUsers.map((user) => (
                  <Card 
                    key={user.userId}
                    className={`p-3 ${onUserClick ? 'hover-elevate active-elevate-2 cursor-pointer' : ''}`}
                    onClick={() => onUserClick?.(user.userId)}
                    data-testid={`user-card-${user.userId}`}
                  >
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                        style={{ backgroundColor: user.color }}
                        data-testid={`user-avatar-${user.userId}`}
                      >
                        {user.name[0]?.toUpperCase() || 'U'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                              <span className="text-sm font-medium" data-testid={`user-name-${user.userId}`}>
                            {user.name}
                          </span>
                          {user.connected ? (
                            <Badge variant="outline" className="text-xs">
                              <Circle className="w-2 h-2 mr-1 fill-green-500 text-green-500" />
                              Online
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              <WifiOff className="w-2 h-2 mr-1" />
                              Offline
                            </Badge>
                          )}
                        </div>
                        {user.activeFile && (
                          <div 
                            className="flex items-center gap-1 mt-1 text-xs text-muted-foreground"
                            data-testid={`user-file-${user.userId}`}
                          >
                            <FileText className="w-3 h-3" />
                            <span className="truncate">{user.activeFileName || user.activeFile}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {activeUsers.length === 0 && currentUser && (
            <div className="text-center py-8">
              <Users className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No other collaborators online</p>
              <p className="text-xs text-muted-foreground mt-1">
                Share this workspace to collaborate in real-time
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
});

export default UserListPanel;
