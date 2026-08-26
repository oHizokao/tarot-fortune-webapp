<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/bootstrap.php';

try {
    request_method('POST');
    unset($_SESSION['admin_id']);
    session_regenerate_id(true);
    success_response();
} catch (Throwable $exception) {
    handle_api_exception($exception);
}
