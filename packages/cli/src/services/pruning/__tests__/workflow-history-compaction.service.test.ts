import { mockLogger } from '@n8n/backend-test-utils';
import type { DbConnection } from '@n8n/db';
import { mock } from 'jest-mock-extended';
import type { InstanceSettings } from 'n8n-core';

import { WorkflowHistoryCompactionService } from '../workflow-history-compaction.service';

describe('WorkflowHistoryCompactionService', () => {
	const dbConnection = mock<DbConnection>({
		connectionState: { migrated: true },
	});

	describe('init', () => {
		it('should start compacting on main instance that is the leader', () => {
			const compactingService = new WorkflowHistoryCompactionService(
				mockLogger(),
				mock<InstanceSettings>({ isLeader: true, isMultiMain: true }),
				dbConnection,
				mock(),
			);
			const startCompacting = jest.spyOn(compactingService, 'startCompacting');

			compactingService.init();

			expect(startCompacting).toHaveBeenCalled();
		});

		it('should not start pruning on main instance that is a follower', () => {
			const compactingService = new WorkflowHistoryCompactionService(
				mockLogger(),
				mock<InstanceSettings>({ isLeader: false, isMultiMain: true }),
				dbConnection,
				mock(),
			);
			const startCompacting = jest.spyOn(compactingService, 'startCompacting');

			compactingService.init();

			expect(startCompacting).not.toHaveBeenCalled();
		});
	});

	describe('startCompacting', () => {
		it('should start pruning if service is enabled and DB is migrated', () => {
			const compactingService = new WorkflowHistoryCompactionService(
				mockLogger(),
				mock<InstanceSettings>({ isLeader: true, instanceType: 'main', isMultiMain: true }),
				dbConnection,
				mock(),
			);

			const scheduleRollingCompactingSpy = jest
				// @ts-expect-error Private method
				.spyOn(compactingService, 'scheduleRollingCompacting')
				.mockImplementation();

			compactingService.startCompacting();

			expect(scheduleRollingCompactingSpy).toHaveBeenCalled();
		});
	});
});
