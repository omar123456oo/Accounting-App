<?php

use Illuminate\Support\Facades\Schedule;

// Nightly tamper check. A break is logged at "critical" until Phase 6 wires e-mail notifications.
Schedule::command('audit:verify')->dailyAt('02:00');
