import assert from 'node:assert/strict';

import {
  DEFAULT_WORKSPACE_PANEL_HEIGHTS,
  HEIGHT_CLASS_BY_PANEL_HEIGHT,
  nextWorkspacePanelHeight,
  workspacePanelHeightLabel,
  workspacePanelHeightShortLabel,
} from './workspaceLayout';

assert.equal(DEFAULT_WORKSPACE_PANEL_HEIGHTS['2d'], 'tall');
assert.equal(DEFAULT_WORKSPACE_PANEL_HEIGHTS['3d'], 'tall');
assert.equal(HEIGHT_CLASS_BY_PANEL_HEIGHT.tall, 'h-[780px]');

assert.equal(nextWorkspacePanelHeight('tall'), 'medium');
assert.equal(nextWorkspacePanelHeight('medium'), 'tall');
assert.equal(nextWorkspacePanelHeight('short'), 'tall');
assert.equal(nextWorkspacePanelHeight(undefined), 'tall');

assert.equal(workspacePanelHeightLabel('short'), '中 (560px)');
assert.equal(workspacePanelHeightShortLabel('short'), 'H: 中');

console.log('workspaceLayout helpers passed');
