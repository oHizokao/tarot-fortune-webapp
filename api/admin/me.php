<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/bootstrap.php';

try {
    request_method('GET');
    $admin = require_admin_user();
    success_response([
        'authenticated' => true,
        'user' => public_user($admin),
        'csrf_token' => csrf_token(),
        'ai_configured' => ai_is_configured(),
        'model' => (string)(app_config()['openai']['model'] ?? ''),
    ]);
} catch (Throwable $exception) {
    handle_api_exception($exception);
}
