# ipvote

For running polls where each IP address gets one vote.
For IPv6 votes, one vote per /64 block is allowed as the address space is much bigger and this block size would have a comparable purchase price of a IPv4 address.

The voting data is publicly shared with the last bit of the IP address masked.
This allows for independen analyses of the data.

Currently there is the option to exclude TOR exit node IP addresses to mitigate poll manipulation.
It is planned to also extend this to known VPN and Cloud IPs.
In adddition there will be support for determining the rough geographic location based on network latency triangulation. This will enable mitigation of geolocation spoofing.

Live at:

https://ip-vote.com/a_or_b
