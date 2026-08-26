<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/bootstrap.php';
require_once dirname(__DIR__) . '/lib/access.php';

try {
    request_method('POST');
    require_admin_user();
    $data = request_json();
    require_csrf($data);
    $id = (int)($data['id'] ?? 0);
    $action = (string)($data['action'] ?? '');
    $user = find_user_by_id($id);
    if (!$user || ($user['role'] ?? '') !== 'beta_user') {
        throw new TarotApiException('ไม่พบผู้ใช้ Beta', 404, 'USER_NOT_FOUND');
    }

    $pdo = database();
    $accessCode = null;
    if ($action === 'suspend') {
        $statement = $pdo->prepare("UPDATE users SET status = 'suspended', updated_at = UTC_TIMESTAMP() WHERE id = :id AND role = 'beta_user'");
        $statement->execute(['id' => $id]);
    } elseif ($action === 'reactivate') {
        $expires = $user['access_expires_at'] ? strtotime((string)$user['access_expires_at'] . ' UTC') : 0;
        if ($expires <= time()) {
            throw new TarotApiException('ผู้ใช้นี้หมดอายุแล้ว ให้ใช้การต่ออายุก่อน', 422, 'ACCESS_EXPIRED');
        }
        $statement = $pdo->prepare("UPDATE users SET status = 'active', updated_at = UTC_TIMESTAMP() WHERE id = :id AND role = 'beta_user'");
        $statement->execute(['id' => $id]);
    } elseif ($action === 'revoke') {
        $statement = $pdo->prepare("UPDATE users SET status = 'suspended', access_expires_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP() WHERE id = :id AND role = 'beta_user'");
        $statement->execute(['id' => $id]);
    } elseif ($action === 'delete') {
        $statement = $pdo->prepare("DELETE FROM users WHERE id = :id AND role = 'beta_user'");
        $statement->execute(['id' => $id]);
    } elseif ($action === 'extend') {
        $baseTimestamp = max(time(), $user['access_expires_at'] ? strtotime((string)$user['access_expires_at'] . ' UTC') : 0);
        $expires = access_expiry_from_request($data, (new DateTimeImmutable('@' . $baseTimestamp))->setTimezone(new DateTimeZone('UTC')));
        $statement = $pdo->prepare("UPDATE users SET status = 'active', access_started_at = COALESCE(access_started_at, UTC_TIMESTAMP()), access_expires_at = :expires, updated_at = UTC_TIMESTAMP() WHERE id = :id AND role = 'beta_user'");
        $statement->execute(['expires' => $expires->format('Y-m-d H:i:s'), 'id' => $id]);
    } elseif ($action === 'generate_code') {
        $accessCode = 'TF-' . strtoupper(bin2hex(random_bytes(5)));
        $statement = $pdo->prepare('UPDATE users SET access_code_hash = :hash, access_code_hint = :hint, updated_at = UTC_TIMESTAMP() WHERE id = :id AND role = \'beta_user\'');
        $statement->execute([
            'hash' => password_hash($accessCode, PASSWORD_DEFAULT),
            'hint' => substr($accessCode, 0, 8),
            'id' => $id,
        ]);
    } else {
        throw new TarotApiException('ไม่รู้จักคำสั่งจัดการผู้ใช้', 422, 'INVALID_USER_ACTION');
    }

    success_response([
        'user' => $action === 'delete' ? null : public_user(find_user_by_id($id)),
        'access_code' => $accessCode,
    ]);
} catch (Throwable $exception) {
    handle_api_exception($exception);
}
