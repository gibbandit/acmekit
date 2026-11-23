package main

import "testing"

func TestDemoCannotBindPublicly(t *testing.T) {
	for _, address := range []string{"0.0.0.0:8080", ":8080", "[::]:8080", "192.168.1.10:8080", "example.com:8080"} {
		if err := validateAddress(address, true); err == nil {
			t.Errorf("demo accepted non-loopback bind %s", address)
		}
	}
	for _, address := range []string{"127.0.0.1:8080", "127.0.0.2:8080", "[::1]:8080", "localhost:8080"} {
		if err := validateAddress(address, true); err != nil {
			t.Errorf("demo rejected loopback bind %s: %v", address, err)
		}
	}
	if err := validateAddress("0.0.0.0:8080", false); err != nil {
		t.Errorf("normal deployment rejected: %v", err)
	}
}
