<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/bootstrap.php';

try {
    request_method('GET');
    $user = current_beta_user();
    $authenticated = $user !== null && ($user['role'] ?? '') === 'beta_user' && ($user['status'] ?? '') === 'active';

    success_response([
        'authenticated' => $authenticated,
        'user' => $authenticated ? public_user($user) : null,
        'ai_configured' => ai_is_configured(),
    ]);
} catch (Throwable $exception) {
    handle_api_exception($exception);
}
