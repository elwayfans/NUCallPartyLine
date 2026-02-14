import clsx from 'clsx';

interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = 'default', children, className }: BadgeProps) {
  const variants = {
    default: 'bg-gray-100 text-gray-700',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-yellow-100 text-yellow-700',
    danger: 'bg-red-100 text-red-700',
    info: 'bg-blue-100 text-blue-700',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

// Status-specific badges
export function CallStatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { variant: BadgeProps['variant']; label: string }> = {
    QUEUED: { variant: 'default', label: 'Queued' },
    SCHEDULED: { variant: 'info', label: 'Scheduled' },
    RINGING: { variant: 'info', label: 'Ringing' },
    IN_PROGRESS: { variant: 'warning', label: 'In Progress' },
    COMPLETED: { variant: 'success', label: 'Completed' },
    FAILED: { variant: 'danger', label: 'Failed' },
    NO_ANSWER: { variant: 'warning', label: 'No Answer' },
    BUSY: { variant: 'warning', label: 'Busy' },
    VOICEMAIL: { variant: 'info', label: 'Voicemail' },
    CANCELLED: { variant: 'default', label: 'Cancelled' },
  };

  const config = statusConfig[status] ?? { variant: 'default', label: status };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function CampaignStatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { variant: BadgeProps['variant']; label: string }> = {
    DRAFT: { variant: 'default', label: 'Draft' },
    SCHEDULED: { variant: 'info', label: 'Scheduled' },
    IN_PROGRESS: { variant: 'warning', label: 'In Progress' },
    PAUSED: { variant: 'warning', label: 'Paused' },
    COMPLETED: { variant: 'success', label: 'Completed' },
    CANCELLED: { variant: 'default', label: 'Cancelled' },
  };

  const config = statusConfig[status] ?? { variant: 'default', label: status };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function SentimentBadge({ sentiment }: { sentiment: string }) {
  const sentimentConfig: Record<string, { variant: BadgeProps['variant']; label: string }> = {
    VERY_POSITIVE: { variant: 'success', label: 'Very Positive' },
    POSITIVE: { variant: 'success', label: 'Positive' },
    NEUTRAL: { variant: 'default', label: 'Neutral' },
    NEGATIVE: { variant: 'warning', label: 'Negative' },
    VERY_NEGATIVE: { variant: 'danger', label: 'Very Negative' },
  };

  const config = sentimentConfig[sentiment] ?? { variant: 'default', label: sentiment };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function OutcomeBadge({ outcome }: { outcome: string }) {
  const outcomeConfig: Record<string, { variant: BadgeProps['variant']; label: string }> = {
    SUCCESS: { variant: 'success', label: 'Success' },
    PARTIAL: { variant: 'warning', label: 'Partial' },
    NO_RESPONSE: { variant: 'default', label: 'No Response' },
    CALLBACK_REQUESTED: { variant: 'info', label: 'Callback' },
    WRONG_NUMBER: { variant: 'danger', label: 'Wrong Number' },
    DECLINED: { variant: 'danger', label: 'Declined' },
    TECHNICAL_FAILURE: { variant: 'danger', label: 'Tech Failure' },
  };

  const config = outcomeConfig[outcome] ?? { variant: 'default', label: outcome };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function CallResultBadge({ result }: { result: string }) {
  const resultConfig: Record<string, { variant: BadgeProps['variant']; label: string }> = {
    PASS: { variant: 'success', label: 'Pass' },
    FAIL: { variant: 'danger', label: 'Fail' },
    INCONCLUSIVE: { variant: 'warning', label: 'Inconclusive' },
  };

  const config = resultConfig[result] ?? { variant: 'default', label: result };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
