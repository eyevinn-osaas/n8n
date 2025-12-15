import { createWorkflowHistory, createWorkflowWithHistory, testDb } from '@n8n/backend-test-utils';
import { WorkflowHistoryRepository } from '@n8n/db';
import { Container } from '@n8n/di';
import type { INode } from 'n8n-workflow';
import { v4 as uuid } from 'uuid';

describe('WorkflowHistoryRepository', () => {
	const testNode1 = {
		id: uuid(),
		name: 'testNode1',
		parameters: {},
		type: 'aNodeType',
		typeVersion: 1,
		position: [0, 0],
	} satisfies INode;

	beforeAll(async () => {
		await testDb.init();
	});

	beforeEach(async () => {
		await testDb.truncate(['WorkflowPublishHistory', 'WorkflowHistory', 'WorkflowEntity', 'User']);
	});

	afterAll(async () => {
		await testDb.terminate();
	});

	describe('pruneHistory', () => {
		it('should prune superseded version', async () => {
			const id1 = uuid();
			const id2 = uuid();

			const workflow = await createWorkflowWithHistory({
				versionId: id1,
				nodes: [{ ...testNode1, parameters: { a: 'a' } }],
			});
			await createWorkflowHistory({
				...workflow,
				versionId: uuid(),
				nodes: [{ ...testNode1, parameters: { a: 'ab' } }],
			});
			await createWorkflowHistory({
				...workflow,
				versionId: uuid(),
				nodes: [{ ...testNode1, parameters: { a: 'abc' } }],
			});
			await createWorkflowHistory({
				...workflow,
				versionId: id2,
				nodes: [{ ...testNode1, parameters: { a: 'abcd' } }],
			});

			// ACT
			const repository = Container.get(WorkflowHistoryRepository);

			const tenDaysAgo = new Date();
			tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

			const aDayAgo = new Date();
			aDayAgo.setDate(aDayAgo.getDate() - 1);

			const nextDay = new Date();
			nextDay.setDate(nextDay.getDate() + 1);

			const inTenDays = new Date();
			inTenDays.setDate(inTenDays.getDate() + 10);

			{
				// Don't touch workflows younger than range
				const { deleted, seen } = await repository.pruneHistory(workflow.id, tenDaysAgo, aDayAgo);
				expect(deleted).toBe(0);
				expect(seen).toBe(0);

				const history = await repository.find();
				expect(history.length).toBe(4);
			}

			{
				// Don't touch workflows older
				const { deleted, seen } = await repository.pruneHistory(workflow.id, nextDay, inTenDays);
				expect(deleted).toBe(0);
				expect(seen).toBe(0);

				const history = await repository.find();
				expect(history.length).toBe(4);
			}

			{
				const { deleted, seen } = await repository.pruneHistory(workflow.id, aDayAgo, nextDay);
				expect(deleted).toBe(2);
				expect(seen).toBe(4);

				const history = await repository.find();
				expect(history.length).toBe(2);
				expect(history).toEqual([
					expect.objectContaining({ versionId: id1 }),
					expect.objectContaining({ versionId: id2 }),
				]);
			}
		});

		it('should never prune previously active or named versions', async () => {
			// ARRANGE
			const id1 = uuid();
			const id2 = uuid();
			const id3 = uuid();
			const id4 = uuid();
			const id5 = uuid();

			const workflow = await createWorkflowWithHistory({
				versionId: id1,
				nodes: [{ ...testNode1, parameters: { a: 'a' } }],
			});
			await createWorkflowHistory(
				{
					...workflow,
					versionId: id2,
					nodes: [{ ...testNode1, parameters: { a: 'ab' } }],
				},
				undefined,
				undefined,
				{ name: 'aVersionName' },
			);
			await createWorkflowHistory({
				...workflow,
				versionId: id3,
				nodes: [{ ...testNode1, parameters: { a: 'abc' } }],
			});
			await createWorkflowHistory(
				{
					...workflow,
					versionId: id4,
					nodes: [{ ...testNode1, parameters: { a: 'abcd' } }],
				},
				undefined,
				{ event: 'activated' },
			);
			await createWorkflowHistory({
				...workflow,
				versionId: id5,
				nodes: [{ ...testNode1, parameters: { a: 'abcde' } }],
			});

			// ACT
			const repository = Container.get(WorkflowHistoryRepository);

			const aDayAgo = new Date();
			aDayAgo.setDate(aDayAgo.getDate() - 1);

			const nextDay = new Date();
			nextDay.setDate(nextDay.getDate() + 1);

			const { deleted, seen } = await repository.pruneHistory(workflow.id, aDayAgo, nextDay);

			// ASSERT
			expect(deleted).toBe(1);
			expect(seen).toBe(5);

			const history = await repository.find();
			expect(history.length).toBe(4);
			expect(history).toEqual([
				expect.objectContaining({ versionId: id1 }),
				expect.objectContaining({ versionId: id2 }),
				expect.objectContaining({ versionId: id4 }),
				expect.objectContaining({ versionId: id5 }),
			]);

			const redo = await repository.pruneHistory(workflow.id, aDayAgo, nextDay);

			// ASSERT
			expect(redo.deleted).toBe(0);
			expect(redo.seen).toBe(4);
		});
	});
	describe('getWorkflowIdsInRange', () => {
		it('should return versions in range', async () => {
			const workflowA = await createWorkflowWithHistory({
				versionId: uuid(),
				nodes: [{ ...testNode1, parameters: { a: 'a' } }],
			});
			await new Promise((res) => setTimeout(res, 1));
			const beforeV2 = new Date();

			await createWorkflowHistory({
				...workflowA,
				versionId: uuid(),
				nodes: [{ ...testNode1, parameters: { a: 'abcd' } }],
			});
			await new Promise((res) => setTimeout(res, 1));
			const beforeB = new Date();
			await new Promise((res) => setTimeout(res, 1));

			const workflowB = await createWorkflowWithHistory({
				versionId: uuid(),
				nodes: [{ ...testNode1, parameters: { a: 'a' } }],
			});

			await new Promise((res) => setTimeout(res, 1));
			const afterB = new Date();

			// ACT
			const repository = Container.get(WorkflowHistoryRepository);
			{
				const ids = await repository.getWorkflowIdsInRange(afterB, new Date());
				expect(ids).toEqual([]);
			}
			{
				const ids = await repository.getWorkflowIdsInRange(beforeB, afterB);
				expect(ids).toEqual([workflowB.id]);
			}
			{
				const ids = await repository.getWorkflowIdsInRange(beforeV2, afterB);
				expect(ids).toEqual(expect.arrayContaining([workflowA.id, workflowB.id]));
			}
		});
	});
});

// import { createWorkflowHistory, createWorkflowWithHistory, testDb } from '@n8n/backend-test-utils';
// import { WorkflowHistoryRepository } from '@n8n/db';
// import { Container } from '@n8n/di';
// import type { INode } from 'n8n-workflow';
// import { v4 as uuid } from 'uuid';

// describe('WorkflowHistoryRepository', () => {
// 	const testNode1 = {
// 		id: uuid(),
// 		name: 'testNode1',
// 		parameters: {},
// 		type: 'aNodeType',
// 		typeVersion: 1,
// 		position: [0, 0],
// 	} satisfies INode;

// 	beforeAll(async () => {
// 		await testDb.init();
// 	});

// 	beforeEach(async () => {
// 		await testDb.truncate(['WorkflowPublishHistory', 'WorkflowHistory', 'WorkflowEntity', 'User']);
// 	});

// 	afterAll(async () => {
// 		await testDb.terminate();
// 	});

// 	describe('pruneHistory', () => {
// 		it('should prune superseded version', async () => {
// 			const id1 = uuid();
// 			const id2 = uuid();

// 			const workflow = await createWorkflowWithHistory({
// 				versionId: id1,
// 				nodes: [{ ...testNode1, parameters: { a: 'a' } }],
// 			});
// 			await createWorkflowHistory({
// 				...workflow,
// 				versionId: uuid(),
// 				nodes: [{ ...testNode1, parameters: { a: 'ab' } }],
// 			});
// 			await createWorkflowHistory({
// 				...workflow,
// 				versionId: uuid(),
// 				nodes: [{ ...testNode1, parameters: { a: 'abc' } }],
// 			});
// 			await createWorkflowHistory({
// 				...workflow,
// 				versionId: id2,
// 				nodes: [{ ...testNode1, parameters: { a: 'abcd' } }],
// 			});

// 			// ACT
// 			const repository = Container.get(WorkflowHistoryRepository);
// 			const aDayFromNow = new Date();
// 			aDayFromNow.setDate(aDayFromNow.getDate() + 1);

// 			{
// 				// Don't touch workflows in last 24 hours
// 				const result = await repository.pruneHistory(workflow.id, new Date(), aDayFromNow);
// 				expect(result).toBe(0);

// 				const history = await repository.find();
// 				expect(history.length).toBe(4);
// 			}

// 			const tenDaysFromNow = new Date();
// 			tenDaysFromNow.setDate(tenDaysFromNow.getDate() + 10);

// 			{
// 				// Don't touch workflows olders than 8 days
// 				const result = await repository.pruneHistory(tenDaysFromNow);
// 				expect(result).toBe(0);

// 				const history = await repository.find();
// 				expect(history.length).toBe(4);
// 			}

// 			const twoDaysFromNow = new Date();
// 			twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
// 			{
// 				const result = await repository.pruneHistory(twoDaysFromNow);
// 				expect(result).toBe(2);

// 				const history = await repository.find();
// 				expect(history.length).toBe(2);
// 				expect(history).toEqual([
// 					expect.objectContaining({ versionId: id1 }),
// 					expect.objectContaining({ versionId: id2 }),
// 				]);
// 			}
// 		});
// 	});

// 	it('should never prune previously active or named versions', async () => {
// 		// ARRANGE
// 		const id1 = uuid();
// 		const id2 = uuid();
// 		const id3 = uuid();
// 		const id4 = uuid();
// 		const id5 = uuid();

// 		const workflow = await createWorkflowWithHistory({
// 			versionId: id1,
// 			nodes: [{ ...testNode1, parameters: { a: 'a' } }],
// 		});
// 		await createWorkflowHistory(
// 			{
// 				...workflow,
// 				versionId: id2,
// 				nodes: [{ ...testNode1, parameters: { a: 'ab' } }],
// 			},
// 			undefined,
// 			undefined,
// 			{ name: 'aVersionName' },
// 		);
// 		await createWorkflowHistory({
// 			...workflow,
// 			versionId: id3,
// 			nodes: [{ ...testNode1, parameters: { a: 'abc' } }],
// 		});
// 		await createWorkflowHistory(
// 			{
// 				...workflow,
// 				versionId: id4,
// 				nodes: [{ ...testNode1, parameters: { a: 'abcd' } }],
// 			},
// 			undefined,
// 			{ event: 'activated' },
// 		);
// 		await createWorkflowHistory({
// 			...workflow,
// 			versionId: id5,
// 			nodes: [{ ...testNode1, parameters: { a: 'abcde' } }],
// 		});

// 		// ACT + ASSERT
// 		const repository = Container.get(WorkflowHistoryRepository);
// 		{
// 			// Don't touch workflows in last 24 hours
// 			const result = await repository.pruneHistory(new Date());
// 			expect(result).toBe(0);

// 			const history = await repository.find();
// 			expect(history.length).toBe(5);
// 		}

// 		const tenDaysFromNow = new Date();
// 		tenDaysFromNow.setDate(tenDaysFromNow.getDate() + 10);

// 		{
// 			// Don't touch workflows olders than 8 days
// 			const result = await repository.pruneHistory(tenDaysFromNow);
// 			expect(result).toBe(0);

// 			const history = await repository.find();
// 			expect(history.length).toBe(5);
// 		}

// 		const twoDaysFromNow = new Date();
// 		twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);

// 		{
// 			const result = await repository.pruneHistory(twoDaysFromNow);
// 			expect(result).toBe(1);

// 			const history = await repository.find();
// 			expect(history.length).toBe(4);
// 			expect(history).toEqual([
// 				expect.objectContaining({ versionId: id1 }),
// 				expect.objectContaining({ versionId: id2 }),
// 				expect.objectContaining({ versionId: id4 }),
// 				expect.objectContaining({ versionId: id5 }),
// 			]);
// 		}
// 	});
// });
