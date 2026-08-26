<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/bootstrap.php';

try {
    request_method('POST');
    $security = app_config()['security'] ?? [];
    session_rate_limit('beta_login', (int)($security['login_per_minute'] ?? 10), 60);
    $data = request_json();
    $accessCode = request_string($data, 'access_code', 160);

    $statement = database()->query("SELECT * FROM users WHERE role = 'beta_user' AND access_code_hash IS NOT NULL ORDER BY id DESC");
    $matched = null;
    while ($candidate = $statement->fetch()) {
        $candidate = refresh_user_status($candidate);
        if (($candidate['status'] ?? '') === 'active' && password_verify($accessCode, (string)$candidate['access_code_hash'])) {
            $matched = $candidate;
            break;
        }
    }

    if (!$matched) {
        throw new TarotApiException('รหัสไม่ถูกต้องหรือหมดอายุแล้ว', 401, 'BETA_LOGIN_FAILED');
    }

    session_regenerate_id(true);
    $_SESSION['user_id'] = (int)$matched['id'];
    unset($_SESSION['admin_id']);
    $update = database()->prepare('UPDATE users SET last_login_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP() WHERE id = :id');
    $update->execute(['id' => $matched['id']]);

    success_response([
        'user' => public_user($matched),
        'csrf_token' => csrf_token(),
    ]);
} catch (Throwable $exception) {
    handle_api_exception($exception);
}
