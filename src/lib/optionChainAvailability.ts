export interface OptionChainAvailability {
  canRenderRows: boolean;
  isMissingSelectedExpiry: boolean;
  label: string;
}

export function resolveOptionChainAvailability(totalLiveRows: number, selectedExpiryRows: number): OptionChainAvailability {
  const total = Number.isFinite(Number(totalLiveRows)) ? Number(totalLiveRows) : 0;
  const selected = Number.isFinite(Number(selectedExpiryRows)) ? Number(selectedExpiryRows) : 0;

  if (total <= 0) {
    return {
      canRenderRows: false,
      isMissingSelectedExpiry: false,
      label: '等待公开 mock 期权链',
    };
  }

  if (selected <= 0) {
    return {
      canRenderRows: false,
      isMissingSelectedExpiry: true,
      label: '当前到期日无公开 mock 链行',
    };
  }

  return {
    canRenderRows: true,
    isMissingSelectedExpiry: false,
    label: `公开 mock 期权链 ${selected} rows`,
  };
}
