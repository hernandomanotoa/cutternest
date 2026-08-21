export function getApiErrorMessage(err: any): string {
  if (!err) return 'Error desconocido';
  const detail = err.response?.data?.detail;
  const code = err.response?.data?.code;
  const codePrefix = typeof code === 'string' ? `[${code}] ` : '';
  if (typeof detail === 'string') return `${codePrefix}${detail}`;
  if (Array.isArray(detail)) {
    const message = detail
      .map((item: any) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          if (item.msg) return item.msg;
          return JSON.stringify(item);
        }
        return String(item);
      })
      .join(', ');
    return `${codePrefix}${message}`;
  }
  if (detail && typeof detail === 'object') {
    return `${codePrefix}${detail.msg || JSON.stringify(detail)}`;
  }
  if (err.message) return err.message;
  return 'Error desconocido';
}
