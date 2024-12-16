/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * IMPORTANT: Be careful importing modules, it can break the Language Server due to transitive dependencies
 *            not being available.
 */

import { NotificationType } from 'vscode-languageserver'

// Define custom notification type
export class CrashNotifications {
    /** Tell the server to start listening for heartbeats */
    static readonly Start: NotificationType<{ sessionId: string; rootDir: string; extensionId: string }> =
        new NotificationType('crash/server/start')
    /** Tell the server to start listening for heartbeats */
    static readonly Heartbeat: NotificationType<void> = new NotificationType('crash/server/heartbeat')
    /** Tell the server to stop, signifying a graceful shutdown */
    static readonly Stop = new NotificationType<void>('crash/server/stop')

    /** Tell the client to emit a crash telemetry event */
    static readonly TelemetryNotification = new NotificationType<{ sessionId: string; lastHeartbeat: number }>(
        'crash/client/telemetry'
    )
}

export const crashHeartbeatInterval = 5000
