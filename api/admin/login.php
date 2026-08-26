<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/bootstrap.php';

try {
    request_method('POST');
    $security = app_config()['security'] ?? [];
    session_rate_limit('admin_login', (int)($security['login_per_minute'] ?? 10), 60);
    $data = request_json();
    $email = strtolower(request_string($data, 'email', 190));
    $password = request_string($data, 'password', 255);
    $statement = database()->prepare("SELECT * FROM users WHERE email = :email AND role = 'admin' LIMIT 1");
    $statement->execute(['email' => $email]);
    $admin = $statement->fetch();
    if (!$admin || ($admin['status'] ?? '') !== 'active' || !password_verify($password, (string)$admin['password_hash'])) {
        throw new TarotApiException('อีเมลหรือรหัสผ่านไม่ถูกต้อง', 401, 'ADMIN_LOGIN_FAILED');
    }

    session_regenerate_id(true);
    $_SESSION['admin_id'] = (int)$admin['id'];
    unset($_SESSION['user_id']);
    $update = database()->prepare('UPDATE users SET last_login_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP() WHERE id = :id');
    $update->execute(['id' => $admin['id']]);
    success_response(['user' => public_user($admin), 'csrf_token' => csrf_token()]);
} catch (Throwable $exception) {
    handle_api_exception($exception);
}
