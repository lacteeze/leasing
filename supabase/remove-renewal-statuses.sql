-- Reset legacy renewal statuses after removing Renewing / Not renewing from the app.
update leases
set renewal_status = 'UNKNOWN'
where renewal_status in ('RENEWING', 'NOT_RENEWING');
