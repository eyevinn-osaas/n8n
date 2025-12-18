import { Config, Env } from '../decorators';

@Config
export class WorkflowHistoryCompactionConfig {
	@Env('N8N_WORKFLOW_HISTORY_COMPACTING_MINIMUM_AGE_HOURS')
	compactingMinimumAgeHours: number = 24;

	@Env('N8N_WORKFLOW_HISTORY_COMPACTING_TIME_WINDOW_HOURS')
	compactingTimeWindowHours: number = 1;

	/**
	 * The maximum number of compared workflow versions before waiting `batchDelayMs`
	 * before continuing with the next workflowId.
	 */
	@Env('N8N_WORKFLOW_HISTORY_COMPACTING_BATCH_SIZE')
	batchSize: number = 1_000;

	/**
	 * Delay in milliseconds before continuing with the next workflowId to compact
	 * after having compared at least `batchSize` workflow versions
	 */
	@Env('N8N_WORKFLOW_HISTORY_COMPACTING_BATCH_DELAY_MS')
	batchDelayMs: number = 1_000;
}
