export function getApiErrorMessage(err: any): string {
  if (!err) return 'Error desconocido';
  const detail = err.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item: any) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          if (item.msg) return item.msg;
          return JSON.stringify(item);
        }
        return String(item);
      })
      .join(', ');
  }
  if (detail && typeof detail === 'object') {
    return detail.msg || JSON.stringify(detail);
  }
  if (err.message) return err.message;
  return 'Error desconocido';
}
