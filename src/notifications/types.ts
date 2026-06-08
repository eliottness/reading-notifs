export interface NotificationProvider {
  type: 'email' | 'push' | 'discord';
  send(params: {
    channelConfig: Record<string, unknown>;
    workTitle: string;
    newChapterCount: number;
  }): Promise<{ success: boolean; error?: string }>;
}
