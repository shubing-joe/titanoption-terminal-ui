export type WorkspacePanelHeight = 'medium' | 'tall';
export type WorkspacePanelWidth = 'half' | 'full';

export const WORKSPACE_PANEL_IDS = [
  '2d',
  '3d',
  'odds',
  'volatility',
  'quant',
  'compare',
  'trading',
] as const;

export type WorkspacePanelId = typeof WORKSPACE_PANEL_IDS[number];

export const DEFAULT_WORKSPACE_PANEL_HEIGHTS: Record<WorkspacePanelId, WorkspacePanelHeight> = {
  '2d': 'tall',
  '3d': 'tall',
  'odds': 'medium',
  'volatility': 'medium',
  'quant': 'medium',
  'compare': 'medium',
  'trading': 'medium',
};

export const DEFAULT_WORKSPACE_PANEL_WIDTHS: Record<WorkspacePanelId, WorkspacePanelWidth> = {
  '2d': 'half',
  '3d': 'half',
  'odds': 'half',
  'volatility': 'half',
  'quant': 'half',
  'compare': 'full',
  'trading': 'full',
};

export const DEFAULT_WORKSPACE_PANEL_VISIBILITY: Record<WorkspacePanelId, boolean> = {
  '2d': true,
  '3d': true,
  'odds': true,
  'volatility': true,
  'quant': true,
  'compare': true,
  'trading': true,
};

export const HEIGHT_CLASS_BY_PANEL_HEIGHT: Record<WorkspacePanelHeight, string> = {
  medium: 'h-[560px]',
  tall: 'h-[780px]',
};

export function nextWorkspacePanelHeight(current: WorkspacePanelHeight | 'short' | undefined): WorkspacePanelHeight {
  return current === 'tall' ? 'medium' : 'tall';
}

export function workspacePanelHeightLabel(height: WorkspacePanelHeight | 'short' | undefined): string {
  return height === 'tall' ? '高 (780px)' : '中 (560px)';
}

export function workspacePanelHeightShortLabel(height: WorkspacePanelHeight | 'short' | undefined): string {
  return height === 'tall' ? 'H: 高' : 'H: 中';
}
