import { Logger } from '@n8n/backend-common';
import { Time } from '@n8n/constants';
import { DbConnection, WorkflowHistoryRepository } from '@n8n/db';
import { OnLeaderStepdown, OnLeaderTakeover, OnShutdown } from '@n8n/decorators';
import { Service } from '@n8n/di';
import { InstanceSettings } from 'n8n-core';
import { ensureError, sleep } from 'n8n-workflow';
import { strict } from 'node:assert';

/**
 * Responsible for compacting auto saved workflow history entries in the database.
 */
@Service()
export class WorkflowHistoryCompactionService {
	private compactingInterval: NodeJS.Timeout | undefined;

	private readonly minimumCompactAgeHours = 24;
	private readonly compactingTimeRangeHours = 1;

	private readonly batchSize = 1_000;
	private readonly batchDelayMs = 1_000;

	private readonly rates = {
		compacting: this.compactingTimeRangeHours * Time.hours.toMilliseconds,
	};

	private isShuttingDown = false;

	constructor(
		private readonly logger: Logger,
		private readonly instanceSettings: InstanceSettings,
		private readonly dbConnection: DbConnection,
		private readonly workflowHistoryRepository: WorkflowHistoryRepository,
	) {
		this.logger = this.logger.scoped('history-compacting');
	}

	init() {
		strict(this.instanceSettings.instanceRole !== 'unset', 'Instance role is not set');

		if (this.instanceSettings.isLeader) this.startCompacting();
	}

	get isEnabled() {
		return this.instanceSettings.instanceType === 'main' && this.instanceSettings.isLeader;
	}

	@OnLeaderTakeover()
	startCompacting() {
		const { connectionState } = this.dbConnection;
		if (!this.isEnabled || !connectionState.migrated || this.isShuttingDown) return;

		this.scheduleRollingCompacting();

		this.logger.debug('Started compacting workflow histories');
	}

	@OnLeaderStepdown()
	stopCompacting() {
		if (!this.isEnabled) return;

		clearInterval(this.compactingInterval);

		this.logger.debug('Stopped compacting workflow histories');
	}

	private scheduleRollingCompacting(rateMs = this.rates.compacting) {
		this.compactingInterval = setInterval(async () => await this.compactHistories(), rateMs);

		this.logger.debug(`Compacting histories every ${rateMs * Time.milliseconds.toHours} hour(s)`);
	}

	@OnShutdown()
	shutdown(): void {
		this.isShuttingDown = true;
		this.stopCompacting();
	}

	private async compactHistories(): Promise<void> {
		const now = Date.now();

		const startDate = new Date(
			now -
				(this.minimumCompactAgeHours + this.compactingTimeRangeHours) * Time.hours.toMilliseconds,
		);
		const endDate = new Date(now - this.minimumCompactAgeHours * Time.hours.toMilliseconds);

		const startIso = startDate.toISOString();
		const endIso = endDate.toISOString();

		const workflowIds = await this.workflowHistoryRepository.getWorkflowIdsInRange(
			startDate,
			endDate,
		);

		this.logger.debug(
			`Found ${workflowIds.length} workflows with versions between ${startDate.toISOString()} and ${endDate.toISOString()}`,
		);

		let seenSum = 0;
		for (const [index, workflowId] of workflowIds.entries()) {
			try {
				const { seen, deleted } = await this.workflowHistoryRepository.pruneHistory(
					workflowId,
					startDate,
					endDate,
				);
				seenSum += seen;

				this.logger.debug(
					`Deleted ${deleted} of ${seen} versions of workflow ${workflowId} between ${startIso} and ${endIso}`,
				);
			} catch (error) {
				this.logger.error(`Failed to prune version history of workflow ${workflowId}`, {
					error: ensureError(error),
				});
			}

			if (seenSum > this.batchSize) {
				this.logger.warn(
					`Encountered more than ${this.batchSize} workflow versions, waiting ${this.batchDelayMs * Time.milliseconds.toSeconds} second(s) before continuing.`,
				);
				this.logger.warn(
					`Compacted ${index} of ${workflowIds.length} workflows with versions between ${startIso} and ${endIso}`,
				);
				await sleep(this.batchDelayMs);
				seenSum = 0;
			}
		}
	}
}
