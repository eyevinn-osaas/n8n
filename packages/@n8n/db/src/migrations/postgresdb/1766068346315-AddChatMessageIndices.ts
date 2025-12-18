import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class AddChatMessageIndices1766068346315 implements ReversibleMigration {
	async up({ runQuery, escape, tablePrefix }: MigrationContext) {
		const sessionsTable = escape.tableName('chat_hub_sessions');

		const idColumn = escape.columnName('id');
		const lastMessageAtColumn = escape.columnName('lastMessageAt');
		const createdAtColumn = escape.columnName('createdAt');
		const ownerIdColumn = escape.columnName('ownerId');

		const messagesTable = escape.tableName('chat_hub_messages');
		const sessionIdColumn = escape.columnName('sessionId');

		// Backfill lastMessageAt for existing rows to allow adding a NOT NULL constraint
		await runQuery(
			`UPDATE ${sessionsTable}
			SET ${lastMessageAtColumn} = ${createdAtColumn}
			WHERE ${lastMessageAtColumn} IS NULL`,
		);

		// Make lastMessageAt NOT NULL with a default value of CURRENT_TIMESTAMP
		await runQuery(
			`ALTER TABLE ${sessionsTable}
  		ALTER COLUMN ${lastMessageAtColumn} SET DEFAULT CURRENT_TIMESTAMP(3)`,
		);
		await runQuery(
			`ALTER TABLE ${sessionsTable}
			ALTER COLUMN ${lastMessageAtColumn} SET NOT NULL`,
		);

		// Index intended for faster sessionRepository.getManyByUserId queries
		await runQuery(
			'CREATE INDEX IF NOT EXISTS ' +
				escape.tableName(`idx_${tablePrefix}chat_hub_sessions_owner_lastmsg_id`) +
				` ON ${sessionsTable}(${ownerIdColumn}, ${lastMessageAtColumn} DESC, ${idColumn})`,
		);

		// Index intended for faster sessionRepository.getOneByIdAndUserId queries and joins
		await runQuery(
			'CREATE INDEX IF NOT EXISTS ' +
				escape.tableName(`idx_${tablePrefix}chat_hub_messages_sessionId`) +
				` ON ${messagesTable}(${sessionIdColumn})`,
		);
	}

	async down({ runQuery, escape, tablePrefix }: MigrationContext) {
		const sessionsTable = escape.tableName('chat_hub_sessions');
		const lastMessageAtColumn = escape.columnName('lastMessageAt');

		await runQuery(
			'DROP INDEX IF EXISTS ' +
				escape.tableName(`idx_${tablePrefix}chat_hub_sessions_owner_lastmsg_id`),
		);

		await runQuery(
			'DROP INDEX IF EXISTS ' + escape.tableName(`idx_${tablePrefix}chat_hub_messages_sessionId`),
		);

		await runQuery(
			`ALTER TABLE ${sessionsTable}
			ALTER COLUMN ${lastMessageAtColumn} DROP NOT NULL`,
		);
		await runQuery(
			`ALTER TABLE ${sessionsTable}
			ALTER COLUMN ${lastMessageAtColumn} DROP DEFAULT`,
		);
	}
}
