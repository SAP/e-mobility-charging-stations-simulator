import { expect } from 'chai';
import { shallowMount } from '@vue/test-utils';
import CSTable from '@/components/charging-stations/CSTable.vue';
import type { ChargingStationData } from '@/types/ChargingStationType';

describe('CSTable.vue', () => {
  it('renders CS table columns name', () => {
    const chargingStations: ChargingStationData[] = [];
    const wrapper = shallowMount(CSTable, {
      props: { chargingStations, idTag: '0' },
    });
    expect(wrapper.text()).to.include('Action');
    expect(wrapper.text()).to.include('Connector');
    expect(wrapper.text()).to.include('Status');
    expect(wrapper.text()).to.include('Transaction');
    expect(wrapper.text()).to.include('Name');
    expect(wrapper.text()).to.include('Started');
    expect(wrapper.text()).to.include('Registration Status');
    expect(wrapper.text()).to.include('Vendor');
    expect(wrapper.text()).to.include('Model');
    expect(wrapper.text()).to.include('Firmware Version');
  });
});
