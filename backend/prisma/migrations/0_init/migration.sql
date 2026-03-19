-- Initial migration: create all base tables
-- Uses CREATE TABLE IF NOT EXISTS so it is safe to run on existing databases

CREATE TABLE IF NOT EXISTS `User` (
    `id`               VARCHAR(36)  NOT NULL,
    `email`            VARCHAR(255) NOT NULL,
    `emailVerified`    BOOLEAN      NULL DEFAULT false,
    `name`             VARCHAR(255) NULL,
    `image`            VARCHAR(255) NULL,
    `createdAt`        TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt`        TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `completedWizards` TEXT         NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `email` (`email`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `organizations` (
    `id`          VARCHAR(191) NOT NULL,
    `name`        VARCHAR(255) NOT NULL,
    `slug`        VARCHAR(100) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `theme`       VARCHAR(10)  NOT NULL DEFAULT 'dark',
    `createdAt`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`   DATETIME(3)  NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `organizations_slug_key` (`slug`),
    INDEX `organizations_createdById_idx` (`createdById`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `memberships` (
    `id`        VARCHAR(191) NOT NULL,
    `userId`    VARCHAR(191) NOT NULL,
    `orgId`     VARCHAR(191) NOT NULL,
    `role`      ENUM('OWNER','ADMIN','STAFF','CLIENT','HALL_OF_JUSTICE') NOT NULL,
    `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3)  NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `memberships_userId_orgId_key` (`userId`, `orgId`),
    INDEX `memberships_orgId_idx` (`orgId`),
    INDEX `memberships_userId_idx` (`userId`),
    CONSTRAINT `memberships_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `memberships_orgId_fkey`  FOREIGN KEY (`orgId`)  REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `invites` (
    `id`           VARCHAR(191) NOT NULL,
    `orgId`        VARCHAR(191) NOT NULL,
    `email`        VARCHAR(255) NOT NULL,
    `role`         ENUM('OWNER','ADMIN','STAFF','CLIENT','HALL_OF_JUSTICE') NOT NULL,
    `token`        VARCHAR(64)  NOT NULL,
    `expiresAt`    DATETIME(3)  NOT NULL,
    `status`       ENUM('PENDING','ACCEPTED','EXPIRED','REVOKED') NOT NULL DEFAULT 'PENDING',
    `invitedById`  VARCHAR(191) NOT NULL,
    `acceptedById` VARCHAR(191) NULL,
    `createdAt`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`    DATETIME(3)  NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `invites_token_key` (`token`),
    INDEX `invites_orgId_idx`         (`orgId`),
    INDEX `invites_token_idx`         (`token`),
    INDEX `invites_email_idx`         (`email`),
    INDEX `invites_acceptedById_fkey` (`acceptedById`),
    INDEX `invites_invitedById_fkey`  (`invitedById`),
    CONSTRAINT `invites_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Account` (
    `id`                   VARCHAR(191) NOT NULL,
    `accountId`            VARCHAR(191) NOT NULL,
    `userId`               VARCHAR(36)  NULL,
    `providerId`           VARCHAR(191) NOT NULL,
    `providerAccountId`    VARCHAR(191) NULL,
    `type`                 VARCHAR(191) NOT NULL DEFAULT 'oauth',
    `expires_at`           INT          NULL,
    `token_type`           VARCHAR(191) NULL,
    `scope`                TEXT         NULL,
    `session_state`        VARCHAR(191) NULL,
    `password`             TEXT         NULL,
    `createdAt`            DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`            DATETIME(3)  NOT NULL,
    `accessToken`          TEXT         NULL,
    `accessTokenExpiresAt` DATETIME(3)  NULL,
    `idToken`              TEXT         NULL,
    `refreshToken`         TEXT         NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `Account_providerId_providerAccountId_key` (`providerId`, `providerAccountId`),
    INDEX `Account_userId_idx` (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Session` (
    `id`        VARCHAR(191) NOT NULL,
    `token`     VARCHAR(191) NOT NULL,
    `userId`    VARCHAR(36)  NULL,
    `expiresAt` DATETIME(3)  NOT NULL,
    `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3)  NOT NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `Session_token_key` (`token`),
    INDEX `Session_userId_idx` (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `verification` (
    `id`         VARCHAR(191) NOT NULL,
    `identifier` VARCHAR(255) NOT NULL,
    `value`      TEXT         NOT NULL,
    `expiresAt`  DATETIME(3)  NOT NULL,
    `createdAt`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `clients` (
    `id`        VARCHAR(191) NOT NULL,
    `name`      VARCHAR(255) NOT NULL,
    `email`     VARCHAR(255) NULL,
    `phone`     VARCHAR(50)  NULL,
    `address`   TEXT         NULL,
    `orgId`     VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3)  NOT NULL,
    PRIMARY KEY (`id`),
    INDEX `clients_orgId_idx` (`orgId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `projects` (
    `id`             VARCHAR(191) NOT NULL,
    `name`           VARCHAR(255) NOT NULL,
    `description`    TEXT         NULL,
    `status`         VARCHAR(20)  NOT NULL DEFAULT 'planning',
    `priority`       VARCHAR(10)  NOT NULL DEFAULT 'medium',
    `color`          VARCHAR(20)  NOT NULL DEFAULT '#646cff',
    `budget`         DECIMAL(10,2) NULL,
    `spent`          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `progress`       INT          NOT NULL DEFAULT 0,
    `estimatedHours` INT          NOT NULL DEFAULT 0,
    `hoursLogged`    INT          NOT NULL DEFAULT 0,
    `startDate`      DATETIME(3)  NULL,
    `endDate`        DATETIME(3)  NULL,
    `clientId`       VARCHAR(191) NULL,
    `clientName`     VARCHAR(255) NULL,
    `orgId`          VARCHAR(191) NOT NULL,
    `createdAt`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`      DATETIME(3)  NOT NULL,
    PRIMARY KEY (`id`),
    INDEX `projects_orgId_idx`    (`orgId`),
    INDEX `projects_status_idx`   (`status`),
    INDEX `projects_priority_idx` (`priority`),
    INDEX `projects_clientId_idx` (`clientId`),
    CONSTRAINT `projects_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `clients` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `macro_tasks` (
    `id`             VARCHAR(50)  NOT NULL,
    `title`          VARCHAR(500) NOT NULL,
    `description`    TEXT         NULL,
    `userId`         VARCHAR(36)  NOT NULL,
    `orgId`          VARCHAR(191) NOT NULL,
    `projectId`      VARCHAR(191) NULL,
    `createdBy`      VARCHAR(36)  NOT NULL,
    `priority`       VARCHAR(10)  NOT NULL DEFAULT 'Medium',
    `estimatedHours` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    `actualHours`    DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    `status`         VARCHAR(20)  NOT NULL DEFAULT 'not_started',
    `category`       VARCHAR(100) NOT NULL DEFAULT 'General',
    `tags`           JSON         NULL,
    `dueDate`        DATETIME(3)  NULL,
    `completedAt`    DATETIME(3)  NULL,
    `createdAt`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    INDEX `macro_tasks_userId_status_idx` (`userId`, `status`),
    INDEX `macro_tasks_orgId_idx`         (`orgId`),
    INDEX `macro_tasks_projectId_idx`     (`projectId`),
    INDEX `macro_tasks_priority_idx`      (`priority`),
    INDEX `macro_tasks_dueDate_idx`       (`dueDate`),
    FULLTEXT INDEX `title`                (`title`, `description`),
    CONSTRAINT `macro_tasks_userId_fkey`   FOREIGN KEY (`userId`)    REFERENCES `User`         (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `macro_tasks_orgId_fkey`    FOREIGN KEY (`orgId`)     REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `macro_tasks_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`    (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `task_comments` (
    `id`        VARCHAR(191) NOT NULL,
    `taskId`    VARCHAR(50)  NOT NULL,
    `orgId`     VARCHAR(191) NOT NULL,
    `userId`    VARCHAR(36)  NOT NULL,
    `content`   TEXT         NOT NULL,
    `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    INDEX `task_comments_taskId_idx` (`taskId`),
    INDEX `task_comments_orgId_idx`  (`orgId`),
    INDEX `task_comments_userId_idx` (`userId`),
    CONSTRAINT `task_comments_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `task_attachments` (
    `id`        VARCHAR(191) NOT NULL,
    `taskId`    VARCHAR(50)  NOT NULL,
    `orgId`     VARCHAR(191) NOT NULL,
    `userId`    VARCHAR(36)  NOT NULL,
    `name`      VARCHAR(500) NOT NULL,
    `mimeType`  VARCHAR(100) NOT NULL DEFAULT 'application/octet-stream',
    `size`      INT          NOT NULL DEFAULT 0,
    `data`      LONGTEXT     NOT NULL,
    `category`  VARCHAR(50)  NOT NULL DEFAULT 'attachment',
    `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    INDEX `task_attachments_taskId_idx` (`taskId`),
    INDEX `task_attachments_orgId_idx`  (`orgId`),
    INDEX `task_attachments_userId_idx` (`userId`),
    CONSTRAINT `task_attachments_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `time_logs` (
    `id`          VARCHAR(50)   NOT NULL,
    `taskId`      VARCHAR(50)   NULL,
    `userId`      VARCHAR(36)   NOT NULL,
    `orgId`       VARCHAR(191)  NOT NULL,
    `begin`       DATETIME(3)   NOT NULL,
    `end`         DATETIME(3)   NULL,
    `duration`    INT           NOT NULL DEFAULT 0,
    `timezone`    VARCHAR(64)   NOT NULL DEFAULT 'UTC',
    `category`    VARCHAR(20)   NOT NULL DEFAULT 'work',
    `description` TEXT          NULL,
    `isBillable`  BOOLEAN       NOT NULL DEFAULT false,
    `hourlyRate`  DECIMAL(10,2) NULL,
    `earnings`    DECIMAL(10,2) NULL,
    `isExported`  BOOLEAN       NOT NULL DEFAULT false,
    `exportedAt`  DATETIME(3)   NULL,
    `createdAt`   DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`   DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    INDEX `time_logs_userId_begin_idx` (`userId`, `begin`),
    INDEX `time_logs_begin_end_idx`    (`begin`, `end`),
    INDEX `time_logs_orgId_idx`        (`orgId`),
    INDEX `time_logs_taskId_idx`       (`taskId`),
    CONSTRAINT `time_logs_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `macro_tasks` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `reports` (
    `id`          VARCHAR(191) NOT NULL,
    `title`       VARCHAR(255) NULL,
    `description` TEXT         NOT NULL,
    `userName`    VARCHAR(255) NOT NULL,
    `image`       LONGTEXT     NULL,
    `projectId`   VARCHAR(191) NULL,
    `userId`      VARCHAR(36)  NOT NULL,
    `orgId`       VARCHAR(191) NOT NULL,
    `createdAt`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`   DATETIME(3)  NOT NULL,
    PRIMARY KEY (`id`),
    INDEX `reports_orgId_idx`     (`orgId`),
    INDEX `reports_userId_idx`    (`userId`),
    INDEX `reports_projectId_idx` (`projectId`),
    INDEX `reports_createdAt_idx` (`createdAt`),
    CONSTRAINT `reports_userId_fkey`   FOREIGN KEY (`userId`)    REFERENCES `User`         (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `reports_orgId_fkey`    FOREIGN KEY (`orgId`)     REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `reports_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`    (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `attendance_logs` (
    `id`            VARCHAR(50)  NOT NULL,
    `userId`        VARCHAR(36)  NOT NULL,
    `orgId`         VARCHAR(191) NOT NULL,
    `timeIn`        DATETIME(3)  NOT NULL,
    `timeOut`       DATETIME(3)  NULL,
    `duration`      INT          NOT NULL DEFAULT 0,
    `breakDuration` INT          NOT NULL DEFAULT 0,
    `notes`         TEXT         NULL,
    `date`          VARCHAR(10)  NOT NULL,
    `createdAt`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`     DATETIME(3)  NOT NULL,
    PRIMARY KEY (`id`),
    INDEX `attendance_logs_userId_idx` (`userId`),
    INDEX `attendance_logs_orgId_idx`  (`orgId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `calendar_events` (
    `id`               VARCHAR(191) NOT NULL,
    `title`            VARCHAR(500) NOT NULL,
    `description`      TEXT         NULL,
    `location`         VARCHAR(500) NULL,
    `startAt`          DATETIME(3)  NOT NULL,
    `endAt`            DATETIME(3)  NOT NULL,
    `allDay`           BOOLEAN      NOT NULL DEFAULT false,
    `color`            VARCHAR(20)  NOT NULL DEFAULT '#007acc',
    `meetLink`         VARCHAR(500) NULL,
    `createdById`      VARCHAR(36)  NOT NULL,
    `orgId`            VARCHAR(191) NOT NULL,
    `googleEventId`    VARCHAR(500) NULL,
    `googleCalendarId` VARCHAR(500) NULL,
    `syncedToGoogle`   BOOLEAN      NOT NULL DEFAULT false,
    `googleSyncedAt`   DATETIME(3)  NULL,
    `createdAt`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`        DATETIME(3)  NOT NULL,
    PRIMARY KEY (`id`),
    INDEX `calendar_events_orgId_idx`           (`orgId`),
    INDEX `calendar_events_orgId_startAt_idx`   (`orgId`, `startAt`),
    INDEX `calendar_events_createdById_idx`     (`createdById`),
    CONSTRAINT `calendar_events_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `calendar_event_attendees` (
    `id`      VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `userId`  VARCHAR(36)  NOT NULL,
    `orgId`   VARCHAR(191) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `calendar_event_attendees_eventId_userId_key` (`eventId`, `userId`),
    INDEX `calendar_event_attendees_orgId_idx`  (`orgId`),
    INDEX `calendar_event_attendees_userId_idx` (`userId`),
    CONSTRAINT `calendar_event_attendees_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `calendar_events` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `leaves` (
    `id`         VARCHAR(191) NOT NULL,
    `userId`     VARCHAR(36)  NOT NULL,
    `orgId`      VARCHAR(191) NOT NULL,
    `type`       VARCHAR(50)  NOT NULL,
    `status`     VARCHAR(20)  NOT NULL DEFAULT 'APPROVED',
    `startDate`  DATETIME(3)  NOT NULL,
    `endDate`    DATETIME(3)  NOT NULL,
    `days`       INT          NOT NULL,
    `reason`     TEXT         NULL,
    `approvedAt` DATETIME(3)  NULL,
    `createdAt`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    INDEX `leaves_userId_idx`           (`userId`),
    INDEX `leaves_orgId_idx`            (`orgId`),
    INDEX `leaves_userId_startDate_idx` (`userId`, `startDate`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
