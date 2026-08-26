<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/bootstrap.php';

try {
    request_method('GET');
    require_admin_user();
    $pdo = database();
    $stats = $pdo->query(
        "SELECT COUNT(*) AS total_requests, SUM(request_status = 'success') AS successful_requests, SUM(request_status = 'failed') AS failed_requests, COALESCE(SUM(input_tokens), 0) AS input_tokens, COALESCE(SUM(output_tokens), 0) AS output_tokens FROM ai_usage WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR)",
    )->fetch() ?: [];
    $users = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role = 'beta_user' AND status = 'active'")->fetchColumn();
    success_response([
        'window' => '24h',
        'stats' => [
            'active_beta_users' => $users,
            'total_requests' => (int)($stats['total_requests'] ?? 0),
            'successful_requests' => (int)($stats['successful_requests'] ?? 0),
            'failed_requests' => (int)($stats['failed_requests'] ?? 0),
            'input_tokens' => (int)($stats['input_tokens'] ?? 0),
            'output_tokens' => (int)($stats['output_tokens'] ?? 0),
        ],
    ]);
} catch (Throwable $exception) {
    handle_api_exception($exception);
}
