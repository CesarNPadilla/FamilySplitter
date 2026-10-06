import { messages } from '../i18n';

export function ResourceNotice({
  status,
  retry,
}: {
  status: 'loading' | 'error';
  retry: () => void;
}) {
  return status === 'loading' ? (
    <p role="status">{messages.expenses.loading}</p>
  ) : (
    <div className="panel">
      <p role="alert">{messages.expenses.loadFailed}</p>
      <button className="secondary-button mt-4" onClick={retry}>
        {messages.auth.retry}
      </button>
    </div>
  );
}
