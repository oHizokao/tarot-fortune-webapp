<?php

declare(strict_types=1);

function access_expiry_from_request(array $data, ?DateTimeImmutable $base = null): DateTimeImmutable
{
    $base = $base ?: utc_now();
    $duration = trim((string)($data['duration'] ?? '24h'));
    $allowed = [
        '3h' => '+3 hours',
        '12h' => '+12 hours',
        '24h' => '+24 hours',
        '3d' => '+3 days',
        '7d' => '+7 days',
    ];
    if (isset($allowed[$duration])) {
        return $base->modify($allowed[$duration]);
    }

    $custom = trim((string)($data['custom_expires_at'] ?? ''));
    if ($custom === '') {
        throw new TarotApiException('กรุณาเลือกระยะเวลาใช้งาน', 422, 'INVALID_ACCESS_DURATION');
    }
    try {
        $parsed = new DateTimeImmutable($custom, new DateTimeZone('Asia/Bangkok'));
        return $parsed->setTimezone(new DateTimeZone('UTC'));
    } catch (Throwable $exception) {
        throw new TarotApiException('วันหมดอายุไม่ถูกต้อง', 422, 'INVALID_ACCESS_DURATION');
    }
}
