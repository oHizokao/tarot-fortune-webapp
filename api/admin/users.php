<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/bootstrap.php';

try {
    request_method('GET');
    require_admin_user();
    $statement = database()->query("SELECT id, name, email, role, status, access_mode, access_started_at, access_expires_at, credits, created_at, last_login_at FROM users WHERE role = 'beta_user' ORDER BY created_at DESC");
    $users = array_map(static function (array $user): array {
        $user['id'] = (int)$user['id'];
        $user['credits'] = (int)$user['credits'];
        return $user;
    }, $statement->fetchAll());
    success_response(['users' => $users]);
} catch (Throwable $exception) {
    handle_api_exception($exception);
}
