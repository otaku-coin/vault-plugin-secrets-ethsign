#!/bin/sh
# Copyright © 2023 Otaku Coin Association
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

set -e

vault=${VAULT:=vault}
ethsign=../../ethsign

mkdir -p plugins
if [ ! -f "$ethsign" ]; then
	(cd ../.. && make all)
fi
cp ../../ethsign plugins

(
sleep 3
export VAULT_ADDR='http://127.0.0.1:8200'
"$vault" login root
"$vault" secrets enable -path=ethereum -description="Ethereum Wallet" -plugin-name=ethsign plugin
"$vault" secrets list
) &

exec "$vault" server -dev -dev-root-token-id=root -dev-plugin-dir=./plugins
