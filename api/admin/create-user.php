<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/bootstrap.php';
require_once dirname(__DIR__) . '/lib/access.php';

try {
    request_method('POST');
    require_admin_user();
    $data = request_json();
    require_csrf($data);
    $name = request_string($data, 'name', 120);
    $email = strtolower(request_string($data, 'email', 190));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        throw new TarotApiException('อีเมลไม่ถูกต้อง', 422, 'INVALID_EMAIL');
    }
    $expires = access_expiry_from_request($data);
    $accessCode = 'TF-' . strtoupper(bin2hex(random_bytes(5)));
    $statement = database()->prepare(
        "INSERT INTO users (name, email, password_hash, access_code_hash, access_code_hint, role, status, access_mode, access_started_at, access_expires_at, credits, created_at, updated_at) VALUES (:name, :email, NULL, :access_code_hash, :access_code_hint, 'beta_user', 'active', 'beta_unlimited', UTC_TIMESTAMP(), :expires, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP())",
    );
    try {
        $statement->execute([
            'name' => $name,
            'email' => $email,
            'access_code_hash' => password_hash($accessCode, PASSWORD_DEFAULT),
            'access_code_hint' => substr($accessCode, 0, 8),
            'expires' => $expires->format('Y-m-d H:i:s'),
        ]);
    } catch (PDOException $exception) {
        if ($exception->getCode() === '23000') {
            throw new TarotApiException('อีเมลนี้มีผู้ใช้อยู่แล้ว', 409, 'EMAIL_ALREADY_EXISTS');
        }
        throw $exception;
    }
    $user = find_user_by_id((int)database()->lastInsertId());
    success_response(['user' => public_user($user), 'access_code' => $accessCode]);
} catch (Throwable $exception) {
    handle_api_exception($exception);
}
