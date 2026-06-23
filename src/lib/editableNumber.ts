export interface EditableNumberResult {
  displayValue: string;
  parsedValue?: number;
  shouldCommit: boolean;
}

export function parseEditableNumberInput(rawValue: string, minValue: number): EditableNumberResult {
  if (rawValue.trim() === '') {
    return {
      displayValue: rawValue,
      shouldCommit: false,
    };
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < minValue) {
    return {
      displayValue: rawValue,
      shouldCommit: false,
    };
  }

  return {
    displayValue: rawValue,
    parsedValue: parsed,
    shouldCommit: true,
  };
}

export function resolveEditableNumberBlurValue(rawValue: string, fallbackValue: number): string {
  if (rawValue.trim() === '') {
    return String(fallbackValue);
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return String(fallbackValue);
  }
  return rawValue;
}
