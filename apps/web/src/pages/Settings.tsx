import { useState } from 'react';
import { CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { Button } from '../components/common/Button';

export function Settings() {
  const [vapiStatus, setVapiStatus] = useState<'unknown' | 'checking' | 'valid' | 'invalid'>('unknown');

  const checkVapiConnection = async () => {
    setVapiStatus('checking');
    try {
      const response = await fetch('/api/health');
      const data = await response.json();
      if (data.status === 'healthy') {
        setVapiStatus('valid');
      } else {
        setVapiStatus('invalid');
      }
    } catch {
      setVapiStatus('invalid');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {/* VAPI Configuration */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">VAPI Configuration</h2>
        <p className="mb-4 text-sm text-gray-600">
          Your VAPI credentials are configured via environment variables on the server.
        </p>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
            <div>
              <p className="font-medium text-gray-900">Connection Status</p>
              <p className="text-sm text-gray-500">Check if VAPI is properly configured</p>
            </div>
            <div className="flex items-center gap-3">
              {vapiStatus === 'valid' && (
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  Connected
                </span>
              )}
              {vapiStatus === 'invalid' && (
                <span className="flex items-center gap-1 text-red-600">
                  <AlertCircle className="h-5 w-5" />
                  Error
                </span>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={checkVapiConnection}
                isLoading={vapiStatus === 'checking'}
              >
                Test Connection
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 p-4">
            <p className="font-medium text-gray-900">Required Environment Variables</p>
            <ul className="mt-2 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <code className="rounded bg-gray-100 px-2 py-0.5">VAPI_API_KEY</code>
                <span className="text-gray-500">- Your VAPI API key</span>
              </li>
              <li className="flex items-center gap-2">
                <code className="rounded bg-gray-100 px-2 py-0.5">VAPI_ASSISTANT_ID</code>
                <span className="text-gray-500">- Your VAPI assistant/script ID</span>
              </li>
              <li className="flex items-center gap-2">
                <code className="rounded bg-gray-100 px-2 py-0.5">VAPI_PHONE_NUMBER_ID</code>
                <span className="text-gray-500">- Your VAPI outbound phone number ID</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* OpenAI Configuration */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">OpenAI Configuration</h2>
        <p className="mb-4 text-sm text-gray-600">
          OpenAI is used for sentiment analysis and response extraction from call transcripts.
        </p>

        <div className="rounded-lg border border-gray-200 p-4">
          <p className="font-medium text-gray-900">Required Environment Variables</p>
          <ul className="mt-2 space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <code className="rounded bg-gray-100 px-2 py-0.5">OPENAI_API_KEY</code>
              <span className="text-gray-500">- Your OpenAI API key</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Webhook Configuration */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">VAPI Webhook Setup</h2>
        <p className="mb-4 text-sm text-gray-600">
          Configure your VAPI assistant to send webhooks to this endpoint to receive call updates.
        </p>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm font-medium text-gray-700">Webhook URL</p>
          <code className="mt-1 block text-sm">
            {window.location.origin}/api/webhooks/vapi
          </code>
          <p className="mt-2 text-xs text-gray-500">
            Add this URL in your VAPI assistant settings under "Server URL"
          </p>
        </div>

        <div className="mt-4">
          <a
            href="https://docs.vapi.ai/server-url"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary-600 hover:underline"
          >
            VAPI Webhook Documentation
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Database Info */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Database</h2>
        <p className="text-sm text-gray-600">
          This application uses PostgreSQL for data storage. Ensure your{' '}
          <code className="rounded bg-gray-100 px-1">DATABASE_URL</code> environment
          variable is correctly configured.
        </p>
      </div>

      {/* Help */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
        <h3 className="font-semibold text-blue-900">Need Help?</h3>
        <p className="mt-2 text-sm text-blue-800">
          For setup instructions and troubleshooting, check the project README or contact
          your system administrator.
        </p>
        <div className="mt-4 flex gap-4">
          <a
            href="https://docs.vapi.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline"
          >
            VAPI Docs
            <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href="https://platform.openai.com/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline"
          >
            OpenAI Docs
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
